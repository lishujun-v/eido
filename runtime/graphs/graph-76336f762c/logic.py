async def execute_work(node_id, context, services):
    if node_id == "greet_english":
        return {"greeting": "hello"}
    elif node_id == "greet_chinese":
        return {"greeting": "你好"}
    return {"greeting": "unknown"}


async def evaluate_condition(node_id, context, labels, services):
    if node_id == "detect_language":
        user_text = context.get("user_text", "")
        is_english = all(ord(c) < 128 for c in user_text)
        return "english" if is_english else "non_english"
    return labels[0] if labels else ""
