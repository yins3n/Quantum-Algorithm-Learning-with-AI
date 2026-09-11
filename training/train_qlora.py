"""QLoRA fine-tuning entry point for Granite tutor behavior.

This trains tutoring style and output discipline, not quantum mathematics.
The simulator and evaluator remain the source of truth at runtime.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainingArguments
from trl import SFTTrainer


def format_messages(example: dict) -> str:
    return "\n".join(f"<|{message['role']}|>\n{message['content']}" for message in example["messages"]) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="ibm-granite/granite-3.2-8b-instruct")
    parser.add_argument("--train", default="training/tutor_train.jsonl")
    parser.add_argument("--eval", default="training/tutor_eval.jsonl")
    parser.add_argument("--output", default="artifacts/granite-tutor-lora")
    parser.add_argument("--epochs", type=float, default=3)
    parser.add_argument("--max-seq-length", type=int, default=512)
    args = parser.parse_args()

    dataset = load_dataset("json", data_files={"train": args.train, "eval": args.eval})
    dataset = dataset.map(lambda example: {"text": format_messages(example)})
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    tokenizer.pad_token = tokenizer.eos_token
    quantization = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16, bnb_4bit_quant_type="nf4")
    model = AutoModelForCausalLM.from_pretrained(args.model, quantization_config=quantization, device_map="auto")
    model.config.use_cache = False
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset["train"],
        eval_dataset=dataset["eval"],
        dataset_text_field="text",
        max_seq_length=args.max_seq_length,
        peft_config=LoraConfig(r=4, lora_alpha=8, lora_dropout=0.05, target_modules="all-linear", task_type="CAUSAL_LM"),
        args=TrainingArguments(
            output_dir=args.output,
            num_train_epochs=args.epochs,
            per_device_train_batch_size=1,
            gradient_accumulation_steps=8,
            gradient_checkpointing=True,
            learning_rate=2e-4,
            logging_steps=1,
            eval_strategy="epoch",
            save_strategy="epoch",
            report_to="none",
            bf16=False,
            fp16=True,
        ),
    )
    trainer.train()
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)
    print(f"Saved LoRA adapter to {Path(args.output).resolve()}")


if __name__ == "__main__":
    main()
