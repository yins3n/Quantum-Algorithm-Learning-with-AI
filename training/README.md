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
pip install --index-url https://download.pytorch.org/whl/cu121 torch==2.5.1
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

The training data is a reviewed starter benchmark. Keep expanding
`tutor_train.jsonl` with quantum-expert-reviewed examples. `tutor_eval.jsonl`
is used during training, while `tutor_test.jsonl` is held out for final
comparison and must not be used for training. A successful training run is
not evidence of factual correctness; the engine must continue grounding every
answer in verified evaluator and simulator facts.

External dataset provenance and licensing are recorded in
`training/dataset_manifest.json`. QuantumKatas is a non-commercial
CC-BY-NC-SA-4.0 source, while Qiskit HumanEval is Apache-2.0. Execute and
review derived examples before adding them to training, and keep benchmark
problems held out when measuring generalization.

## Compare tutor variants

After downloading an adapter from Kaggle, compare the base model, adapter, and
prompt-tuned Ollama model on the same held-out prompts:

```bash
python training/evaluate_tutors.py \
  --adapter /path/to/granite-tutor-lora-v2 \
  --test training/tutor_test.jsonl \
  --output training/evaluation-results.json
```

If Ollama is unavailable, add `--skip-ollama`. To test only the adapter and
Ollama model, add `--skip-base`. The report measures strict single-object JSON validity, required fields,
response schema types, a conservative numeric-grounding signal, and exact
repetition between response fields. It also stores each raw response in the
detailed results so failures can be reviewed. Have an expert review the
detailed outputs before selecting a production model.

The Granite 8B adapter requires more memory than a 6 GB RTX 3060 can provide
for a reliable training step, even with 4-bit loading and gradient
checkpointing. Use a GPU with at least 12 GB VRAM (16 GB recommended), or
enable a cloud GPU runner. The local machine can still run the prompt-tuned
`quantum-tutor` model through Ollama.

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
