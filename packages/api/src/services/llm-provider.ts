import OpenAI from 'openai'

// Lazy-initialized so a missing OPENAI_API_KEY only throws when the insights
// endpoint is actually called, not at server startup (which would crash Render).
let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set — add it to Render environment variables')
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'

export async function callStructured<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: Record<string, unknown>,
  schemaName: string
): Promise<T> {
  const client = getClient()

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: schemaName, schema, strict: true },
    },
  })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('Empty response from LLM provider')
  return JSON.parse(content) as T
}
