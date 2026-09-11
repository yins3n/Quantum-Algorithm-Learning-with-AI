"""Compare Granite tutor variants on a held-out JSONL prompt set.

The evaluator measures response format and conservative grounding signals. It
does not replace expert review or the deterministic circuit evaluator.
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

REQUIRED_FIELDS = {"explanation", "error_category", "hint", "suggested_fix", "next_step"}
SYSTEM_PROMPT = (
    "You are a quantum-computing tutor. Use only VERIFIED_FACTS. "
    "Never invent simulator results. Return JSON with explanation, "
    "error_category, hint, suggested_fix, and next_step."
)


def load_records(path: str) -> list[dict[str, Any]]:
    with open(path, encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def user_prompt(record: dict[str, Any]) -> str:
    return next(message["content"] for message in record["messages"] if message["role"] == "user")


def verified_facts(prompt: str) -> str:
    marker = "VERIFIED_FACTS: "
    start = prompt.find(marker)
    if start < 0:
        return ""
    start += len(marker)
    end = prompt.find("\nQUESTION:", start)
    return prompt[start:] if end < 0 else prompt[start:end]


def format_prompt(record: dict[str, Any]) -> str:
    return f"<|system|>\n{SYSTEM_PROMPT}\n<|user|>\n{user_prompt(record)}\n<|assistant|>\n"


def extract_json(text: str) -> dict[str, Any] | None:
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*|\s*```$", "", candidate, flags=re.IGNORECASE | re.DOTALL)
    try:
        value = json.loads(candidate)
    except json.JSONDecodeError:
        try:
            value, end = json.JSONDecoder().raw_decode(candidate)
        except json.JSONDecodeError:
            return None
        if candidate[end:].strip():
            return None
    return value if isinstance(value, dict) else None


def forbidden_claims(text: str, facts: str) -> list[str]:
    fact_numbers = set(re.findall(r"(?<![A-Za-z])(?:\d+\.\d+|\d+)(?![A-Za-z])", facts))
    response_numbers = set(re.findall(r"(?<![A-Za-z])(?:\d+\.\d+|\d+)(?![A-Za-z])", text))
    unsupported = sorted(response_numbers - fact_numbers)
    return unsupported


def score_response(response: str, facts: str) -> dict[str, Any]:
    parsed = extract_json(response)
    if parsed is None:
        return {
            "json_valid": False,
            "required_fields": False,
            "unsupported_numbers": [],
            "repeated_fields": [],
            "response": response,
            "score": 0,
        }
    missing = sorted(REQUIRED_FIELDS - parsed.keys())
    unsupported = forbidden_claims(response, facts)
    schema_errors = []
    if not isinstance(parsed.get("explanation"), str):
        schema_errors.append("explanation must be a string")
    if not isinstance(parsed.get("error_category"), str):
        schema_errors.append("error_category must be a string")
    if not isinstance(parsed.get("hint"), str):
        schema_errors.append("hint must be a string")
    if parsed.get("suggested_fix") is not None and not isinstance(parsed.get("suggested_fix"), dict):
        schema_errors.append("suggested_fix must be an object or null")
    if not isinstance(parsed.get("next_step"), str):
        schema_errors.append("next_step must be a string")
    explanation = str(parsed.get("explanation", "")).strip().lower()
    hint = str(parsed.get("hint", "")).strip().lower()
    next_step = str(parsed.get("next_step", "")).strip().lower()
    repeated_fields = []
    if explanation and explanation == hint:
        repeated_fields.append("explanation=hint")
    if explanation and explanation == next_step:
        repeated_fields.append("explanation=next_step")
    if hint and hint == next_step:
        repeated_fields.append("hint=next_step")
    format_score = int(not missing)
    grounding_score = int(not unsupported)
    return {
        "json_valid": True,
        "required_fields": not missing,
        "missing_fields": missing,
        "schema_errors": schema_errors,
        "unsupported_numbers": unsupported,
        "repeated_fields": repeated_fields,
        "response": response,
        "score": int(not missing and not schema_errors) + grounding_score,
    }


def generate_transformers(model_name: str, adapter: str | None, prompts: list[str], max_new_tokens: int) -> list[str]:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_quant_type="nf4",
    )
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        quantization_config=quantization,
        device_map="auto",
    )
    if adapter:
        from peft import PeftModel

        model = PeftModel.from_pretrained(model, adapter)
    outputs = []
    for prompt in prompts:
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
        with torch.no_grad():
            generated = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=False,
                repetition_penalty=1.05,
                pad_token_id=tokenizer.eos_token_id,
            )
        outputs.append(tokenizer.decode(generated[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True))
    return outputs


def generate_ollama(url: str, model: str, prompts: list[str]) -> list[str]:
    outputs = []
    for prompt in prompts:
        payload = json.dumps({"model": model, "prompt": prompt, "stream": False, "format": "json"}).encode()
        request = urllib.request.Request(
            f"{url.rstrip('/')}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=180) as response:
            body = json.loads(response.read().decode())
        outputs.append(body["response"])
    return outputs


def report(name: str, records: list[dict[str, Any]], outputs: list[str]) -> dict[str, Any]:
    results = [
        score_response(output, verified_facts(user_prompt(record)))
        for record, output in zip(records, outputs, strict=True)
    ]
    summary = {
        "model": name,
        "examples": len(results),
        "json_valid_rate": sum(item["json_valid"] for item in results) / len(results),
        "required_fields_rate": sum(item["required_fields"] and not item.get("schema_errors") for item in results) / len(results),
        "grounded_number_rate": sum(not item["unsupported_numbers"] for item in results) / len(results),
        "non_redundant_rate": sum(not item["repeated_fields"] for item in results) / len(results),
        "mean_score": sum(item["score"] for item in results) / len(results),
        "details": results,
    }
    print(json.dumps(summary, indent=2))
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", default="training/tutor_test.jsonl")
    parser.add_argument("--base-model", default="ibm-granite/granite-3.2-8b-instruct")
    parser.add_argument("--adapter")
    parser.add_argument("--ollama-url", default="http://localhost:11434")
    parser.add_argument("--ollama-model", default="quantum-tutor:latest")
    parser.add_argument("--output", default="training/evaluation-results.json")
    parser.add_argument("--max-new-tokens", type=int, default=160)
    parser.add_argument("--skip-base", action="store_true")
    parser.add_argument("--skip-ollama", action="store_true")
    args = parser.parse_args()

    records = load_records(args.test)
    prompts = [format_prompt(record) for record in records]
    reports = []
    if not args.skip_base:
        reports.append(report("granite-base", records, generate_transformers(args.base_model, None, prompts, args.max_new_tokens)))
    if args.adapter:
        reports.append(report("granite-lora", records, generate_transformers(args.base_model, args.adapter, prompts, args.max_new_tokens)))
    if not args.skip_ollama:
        reports.append(report("quantum-tutor-ollama", records, generate_ollama(args.ollama_url, args.ollama_model, prompts)))
    Path(args.output).write_text(json.dumps(reports, indent=2), encoding="utf-8")
    print(f"Saved evaluation report to {args.output}")


if __name__ == "__main__":
    main()
