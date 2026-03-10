import typing
from backend.app.processors.attention_processor import AttentionProcessor
from backend.app.processors.cognitive_load_processor import CognitiveLoadProcessor

p = AttentionProcessor()
hints = typing.get_type_hints(p._on_engagement)
print("attention _on_engagement hints:", hints)

p2 = CognitiveLoadProcessor()
hints2 = typing.get_type_hints(p2._on_response)
print("cognitive _on_response hints:", hints2)
