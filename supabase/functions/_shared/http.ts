import { corsHeaders } from './cors.ts'

function withHeaders(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export const json = (body: unknown) => withHeaders(body, 200)
export const badRequest = (message: string) => withHeaders({ error: message }, 400)
export const unauthorized = () => withHeaders({ error: 'Missing or invalid Authorization header' }, 401)
export const notFound = (message?: string) => withHeaders({ error: message ?? 'Not found' }, 404)
export const serverError = (message: string) => withHeaders({ error: message }, 500)
export const badGateway = (message: string) => withHeaders({ error: message }, 502)
