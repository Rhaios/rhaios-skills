import type { Address } from 'viem';

/**
 * Per-wallet per-chain nonce manager.
 *
 * Prevents nonce collisions by:
 *  1. Reading the pending nonce from the chain (includes mempool txs)
 *  2. Tracking locally allocated nonces within the current process
 *  3. Using max(chain pending nonce, local next nonce) for each allocation
 *
 * This handles both concurrent external submissions (via pending blockTag)
 * and multiple allocations within a single script run (via local tracking).
 */

type NonceKey = `${Lowercase<string>}:${number}`;

interface NonceState {
  /** Next nonce we expect to allocate (one past the last allocated). */
  nextNonce: bigint;
  /** Nonces allocated in this process that haven't been confirmed yet. */
  pending: Set<bigint>;
}

function nonceKey(wallet: Address, chainId: number): NonceKey {
  return `${wallet.toLowerCase()}:${chainId}` as NonceKey;
}

export interface PublicClientLike {
  getTransactionCount: (args: { address: Address; blockTag?: string }) => Promise<number | bigint>;
}

export class NonceManager {
  private state = new Map<NonceKey, NonceState>();

  /**
   * Acquire the next nonce for a wallet on a chain.
   *
   * Reads the pending nonce from chain state and reconciles with any nonces
   * already allocated in this process. Returns the safe next nonce and marks
   * it as pending.
   */
  async acquireNonce(
    publicClient: PublicClientLike,
    wallet: Address,
    chainId: number,
  ): Promise<bigint> {
    const key = nonceKey(wallet, chainId);

    // Read chain pending nonce (includes mempool txs).
    const chainNonce = BigInt(
      await publicClient.getTransactionCount({
        address: wallet,
        blockTag: 'pending',
      }),
    );

    let entry = this.state.get(key);
    if (!entry) {
      entry = { nextNonce: chainNonce, pending: new Set() };
      this.state.set(key, entry);
    }

    // Take the max of chain pending nonce and our local tracking.
    // Chain may have advanced (external tx confirmed) or we may be ahead
    // (allocated locally but not yet in mempool).
    const nonce = chainNonce > entry.nextNonce ? chainNonce : entry.nextNonce;

    entry.nextNonce = nonce + 1n;
    entry.pending.add(nonce);
    return nonce;
  }

  /**
   * Peek at the next nonce without allocating it.
   * Useful for read-only checks (e.g. EIP-7702 auth nonce estimation).
   */
  async peekNextNonce(
    publicClient: PublicClientLike,
    wallet: Address,
    chainId: number,
  ): Promise<bigint> {
    const key = nonceKey(wallet, chainId);

    const chainNonce = BigInt(
      await publicClient.getTransactionCount({
        address: wallet,
        blockTag: 'pending',
      }),
    );

    const entry = this.state.get(key);
    if (!entry) return chainNonce;

    return chainNonce > entry.nextNonce ? chainNonce : entry.nextNonce;
  }

  /**
   * Mark a nonce as confirmed (transaction mined).
   * Removes it from the pending set.
   */
  confirmNonce(wallet: Address, chainId: number, nonce: bigint): void {
    const entry = this.state.get(nonceKey(wallet, chainId));
    if (entry) entry.pending.delete(nonce);
  }

  /**
   * Mark a nonce as failed. Removes it from pending and adjusts nextNonce
   * downward if this was the most recent allocation and no later nonces
   * are pending — this fills the gap rather than leaving a nonce hole.
   */
  failNonce(wallet: Address, chainId: number, nonce: bigint): void {
    const key = nonceKey(wallet, chainId);
    const entry = this.state.get(key);
    if (!entry) return;
    entry.pending.delete(nonce);

    // If nothing is pending above this nonce, we can reuse it.
    if (nonce + 1n === entry.nextNonce) {
      let rewind = nonce;
      while (rewind > 0n && !entry.pending.has(rewind - 1n)) {
        rewind--;
      }
      // Only rewind to this failed nonce (not further — earlier nonces may
      // have been consumed by the chain).
      entry.nextNonce = nonce;
    }
  }

  /** Check if any nonces have been allocated for a wallet/chain. */
  hasPendingNonces(wallet: Address, chainId: number): boolean {
    const entry = this.state.get(nonceKey(wallet, chainId));
    return entry ? entry.pending.size > 0 : false;
  }
}
