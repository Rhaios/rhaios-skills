import { describe, expect, test } from 'bun:test';
import type { Address } from 'viem';
import { NonceManager, type PublicClientLike } from './nonce-manager.ts';

const WALLET = '0x1234567890abcdef1234567890abcdef12345678' as Address;
const CHAIN_ID = 8453;

function mockClient(nonce: number | bigint): PublicClientLike {
  return {
    getTransactionCount: async () => nonce,
  };
}

describe('NonceManager', () => {
  test('acquireNonce returns chain nonce on first call', async () => {
    const nm = new NonceManager();
    const nonce = await nm.acquireNonce(mockClient(5), WALLET, CHAIN_ID);
    expect(nonce).toBe(5n);
  });

  test('acquireNonce increments locally for sequential calls', async () => {
    const nm = new NonceManager();
    // Chain always returns 5 (pending hasn't caught up).
    const client = mockClient(5);
    const n1 = await nm.acquireNonce(client, WALLET, CHAIN_ID);
    const n2 = await nm.acquireNonce(client, WALLET, CHAIN_ID);
    const n3 = await nm.acquireNonce(client, WALLET, CHAIN_ID);
    expect(n1).toBe(5n);
    expect(n2).toBe(6n);
    expect(n3).toBe(7n);
  });

  test('acquireNonce uses chain nonce when it advances past local', async () => {
    const nm = new NonceManager();
    const n1 = await nm.acquireNonce(mockClient(5), WALLET, CHAIN_ID);
    expect(n1).toBe(5n);
    // Chain advanced to 10 (external txs confirmed).
    const n2 = await nm.acquireNonce(mockClient(10), WALLET, CHAIN_ID);
    expect(n2).toBe(10n);
  });

  test('separate wallets have independent nonces', async () => {
    const nm = new NonceManager();
    const wallet2 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;
    const n1 = await nm.acquireNonce(mockClient(5), WALLET, CHAIN_ID);
    const n2 = await nm.acquireNonce(mockClient(10), wallet2, CHAIN_ID);
    expect(n1).toBe(5n);
    expect(n2).toBe(10n);
  });

  test('separate chains have independent nonces', async () => {
    const nm = new NonceManager();
    const n1 = await nm.acquireNonce(mockClient(5), WALLET, 8453);
    const n2 = await nm.acquireNonce(mockClient(10), WALLET, 1);
    expect(n1).toBe(5n);
    expect(n2).toBe(10n);
  });

  test('confirmNonce removes from pending', async () => {
    const nm = new NonceManager();
    const nonce = await nm.acquireNonce(mockClient(5), WALLET, CHAIN_ID);
    expect(nm.hasPendingNonces(WALLET, CHAIN_ID)).toBe(true);
    nm.confirmNonce(WALLET, CHAIN_ID, nonce);
    expect(nm.hasPendingNonces(WALLET, CHAIN_ID)).toBe(false);
  });

  test('failNonce rewinds nextNonce when it was the most recent', async () => {
    const nm = new NonceManager();
    const n1 = await nm.acquireNonce(mockClient(5), WALLET, CHAIN_ID);
    expect(n1).toBe(5n);
    nm.failNonce(WALLET, CHAIN_ID, n1);
    // Should reuse nonce 5.
    const n2 = await nm.acquireNonce(mockClient(5), WALLET, CHAIN_ID);
    expect(n2).toBe(5n);
  });

  test('failNonce does not rewind past a still-pending earlier nonce', async () => {
    const nm = new NonceManager();
    const client = mockClient(5);
    const n1 = await nm.acquireNonce(client, WALLET, CHAIN_ID);
    const n2 = await nm.acquireNonce(client, WALLET, CHAIN_ID);
    expect(n1).toBe(5n);
    expect(n2).toBe(6n);
    // Fail n2 but n1 is still pending — nextNonce should rewind to 6.
    nm.failNonce(WALLET, CHAIN_ID, n2);
    const n3 = await nm.acquireNonce(client, WALLET, CHAIN_ID);
    expect(n3).toBe(6n);
  });

  test('peekNextNonce does not allocate', async () => {
    const nm = new NonceManager();
    const client = mockClient(5);
    const peek = await nm.peekNextNonce(client, WALLET, CHAIN_ID);
    expect(peek).toBe(5n);
    // Peek again — same value, nothing allocated.
    const peek2 = await nm.peekNextNonce(client, WALLET, CHAIN_ID);
    expect(peek2).toBe(5n);
    expect(nm.hasPendingNonces(WALLET, CHAIN_ID)).toBe(false);
  });

  test('peekNextNonce reflects local state after acquireNonce', async () => {
    const nm = new NonceManager();
    const client = mockClient(5);
    await nm.acquireNonce(client, WALLET, CHAIN_ID);
    const peek = await nm.peekNextNonce(client, WALLET, CHAIN_ID);
    expect(peek).toBe(6n);
  });
});
