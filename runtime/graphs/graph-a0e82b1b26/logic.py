async def execute_work(node_id, context, services):
    """
    Work 节点统一入口。
    ai_reply 节点：调用 AI 模型，根据用户问题生成智能回复。
    """
    if node_id == "ai_reply":
        question = context["question"]
        instruction = (
            "你是一个智能问答助手，请根据用户的问题"
            "给出准确、有帮助的回复。"
        )
        result = await services.ai_process(instruction, question)
        return {"answer": result}
