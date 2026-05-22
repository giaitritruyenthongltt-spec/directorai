export interface JsonRpcRequest<P = unknown> {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly method: string;
  readonly params?: P;
}

export interface JsonRpcNotification<P = unknown> {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: P;
}

export interface JsonRpcSuccess<R = unknown> {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly result: R;
}

export interface JsonRpcErrorPayload {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export interface JsonRpcErrorResponse {
  readonly jsonrpc: '2.0';
  readonly id: string | number | null;
  readonly error: JsonRpcErrorPayload;
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccess
  | JsonRpcErrorResponse;

export const RpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  ADAPTER_ERROR: -32001,
  TIMEOUT: -32002,
  CANCELLED: -32003,
} as const;

export function isRequest(m: unknown): m is JsonRpcRequest {
  return (
    typeof m === 'object' &&
    m !== null &&
    (m as JsonRpcRequest).jsonrpc === '2.0' &&
    'id' in m &&
    'method' in m
  );
}

export function isResponse(m: unknown): m is JsonRpcSuccess | JsonRpcErrorResponse {
  return (
    typeof m === 'object' &&
    m !== null &&
    (m as JsonRpcSuccess).jsonrpc === '2.0' &&
    'id' in m &&
    ('result' in m || 'error' in m)
  );
}
