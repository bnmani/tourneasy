import { ApiError, apiSend } from '@/lib/api';

function respond(status: number, body: string) {
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue(new Response(body || null, { status })) as jest.Mock;
}

describe('apiSend', () => {
  it('returns null for a 202 answer without a body (forgot password)', async () => {
    respond(202, '');
    await expect(
      apiSend('POST', '/auth/forgot-password', { email: 'a@b.test' }),
    ).resolves.toBeNull();
  });

  it('parses a JSON body', async () => {
    respond(200, JSON.stringify({ ok: true }));
    await expect(apiSend('PATCH', '/me', {})).resolves.toEqual({ ok: true });
  });

  it('keeps the fields the server rejected', async () => {
    respond(
      422,
      JSON.stringify({
        error: {
          code: 'VALIDATION',
          message: 'Not valid.',
          details: { fields: { lastNamePrefix: 'invalid' } },
        },
      }),
    );
    const error = await apiSend('PATCH', '/me', {}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fields).toEqual({ lastNamePrefix: 'invalid' });
  });
});
