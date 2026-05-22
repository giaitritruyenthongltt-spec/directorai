import { describe, it, expect } from 'vitest';
import { isRequest, isResponse, RpcErrorCode } from '../rpc.js';

describe('rpc type guards', () => {
  it('isRequest accepts a valid request', () => {
    expect(isRequest({ jsonrpc: '2.0', id: 1, method: 'foo' })).toBe(true);
  });

  it('isRequest rejects non-2.0', () => {
    expect(isRequest({ jsonrpc: '1.0', id: 1, method: 'foo' })).toBe(false);
  });

  it('isRequest rejects missing method', () => {
    expect(isRequest({ jsonrpc: '2.0', id: 1 })).toBe(false);
  });

  it('isResponse accepts success', () => {
    expect(isResponse({ jsonrpc: '2.0', id: 1, result: 42 })).toBe(true);
  });

  it('isResponse accepts error', () => {
    expect(
      isResponse({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32601, message: 'not found' },
      })
    ).toBe(true);
  });

  it('error codes are stable', () => {
    expect(RpcErrorCode.METHOD_NOT_FOUND).toBe(-32601);
    expect(RpcErrorCode.INTERNAL_ERROR).toBe(-32603);
  });
});
