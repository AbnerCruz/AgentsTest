# Estúdio v39 — correção do motor de IA

## Problema observado
No OpenRouter com `openai/gpt-oss-20b`, algumas deliberações terminavam em `finish_reason=length` sem `message.content`. A interface mostrava uma mensagem incorreta mencionando Groq.

## Correção
- diagnóstico agora usa o provedor ativo;
- OpenRouter recebe `reasoning: { effort, exclude }`;
- GPT-OSS recebe recuperação única para decisões/maestro quando termina por limite;
- agentes econômicos usam `low` por padrão para reduzir custo/latência;
- contador de uso recebe uma nova chave de armazenamento;
- service worker recebe novo nome de cache.
