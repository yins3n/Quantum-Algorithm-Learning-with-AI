from fastapi import FastAPI
from pydantic import BaseModel
from agent import ask_gemini
from circuit import (
    create_bell_state,
    create_superposition,
    create_quantum_teleportation,
)

app = FastAPI()


class GenerateRequest(BaseModel):
    prompt: str


@app.get("/")
def read_root():
    return {"message": "Egreen Quanta Backend is running"}


@app.post("/generate")
def generate(data: GenerateRequest):
    gemini_response = ask_gemini(data.prompt)
    prompt_lower = data.prompt.lower()
    if "teleport" in prompt_lower or "quantum teleportation" in prompt_lower:
        circuit_data = create_quantum_teleportation()
    elif "superposition" in prompt_lower:
        circuit_data = create_superposition()
    else:
        circuit_data = create_bell_state()

    return {
        "status": "success",
        "prompt": data.prompt,
        "response": gemini_response,
        "circuit": str(circuit_data["circuit"]),
    }
