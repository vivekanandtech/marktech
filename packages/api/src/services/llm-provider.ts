import OpenAI from 'openai'

// Single isolation point for the LLM call. Swapping providers later (e.g. to
// Claude) means rewriting only the inside of this function — callers always
// get back parsed, schema-validated JSON regardless of which provider runs.
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'

export async function callStructured<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: Record<string, unknown>,
  schemaName: string
): Promise<T> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')

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
