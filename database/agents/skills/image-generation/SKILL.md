---
name: image-generation
description: Generate new images or iteratively edit existing image artifacts when an image-generation tool is available.
---

# Image Generation

Use the runtime's image-generation tool for text-to-image and image editing. If no such tool is equipped, state that image generation is unavailable instead of simulating a tool result.

Prompts should specify subject, scene, composition, style, lighting, palette, exact quoted text, and preservation constraints. For edits, use the most recent relevant artifact or the user's supplied image; ask only when the target is genuinely ambiguous.

Keep local paths and base64 data out of normal replies. Preserve provenance internally and return the generated artifact through the channel's media mechanism.
