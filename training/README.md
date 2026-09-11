# Granite tutor fine-tuning

This directory contains a small reviewed seed set and a QLoRA training entry
point. The seed set teaches response structure, grounded explanations, hint
progression, and concise feedback. It does **not** teach the model to calculate
quantum results; Qiskit Aer and the evaluator do that.

## Install

Use Python 3.11 or 3.12 for the training environment. Granite 8B QLoRA
fine-tuning is not supported by the repository's Python 3.14 runtime and
requires several GB of VRAM.

```bash
python3.12 -m venv .venv-training
source .venv-training/bin/activate
pip install -r training/requirements.txt
```

## Train

```bash
python training/train_qlora.py
```

The script downloads `ibm-granite/granite-3.2-8b-instruct` from Hugging Face
and writes an adapter to `artifacts/granite-tutor-lora/`. Do not upload model
weights or adapters to Git unless the team has approved the storage and license
arrangement.

The included dataset is only a seed set. Before using the adapter with
learners, expand it with quantum-expert-reviewed examples and compare it
against `tutor_eval.jsonl`. A successful training run is not evidence of
factual correctness; the engine must continue grounding every answer in
verified evaluator and simulator facts.

## Prompt-tuned local model

For immediate local use without downloading a second model, create the
grounded tutor variant:

```bash
ollama create quantum-tutor -f Modelfile.tutor
export OLLAMA_MODEL=quantum-tutor:latest
```

This is prompt/runtime tuning, not weight fine-tuning. It is safe to use while
the reviewed dataset is being expanded.

## Serving a LoRA adapter

Ollama's existing `granite3.2:8b` model does not automatically use a
Transformers/PEFT adapter. Either serve the merged adapter with a compatible
inference server, or merge/convert it into a tested Ollama model first. Keep
`OLLAMA_MODEL=granite3.2:8b` until the adapted model has passed the evaluation
set and an end-to-end integration test.
