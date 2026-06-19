import type { BaseClient, RequestOptions } from "../client.js";
import { MessageStream } from "../message-stream.js";
import type {
  CountTokensParams,
  Message,
  MessageCreateParams,
  MessageStreamParams,
  TokenCount,
} from "../types.js";

export type MessageRequestOptions = Pick<
  RequestOptions,
  "headers" | "maxRetries" | "timeout" | "signal"
>;

/**
 * The `messages` resource — the flagship, Anthropic-wire-compatible surface.
 *
 *   - `create(params)` → `Promise<Message>` (or `MessageStream` when `stream:true`).
 *   - `stream(params)` → `MessageStream` (typed events + accumulated `Message`).
 *   - `countTokens(params)` → `Promise<TokenCount>`.
 */
export class Messages {
  constructor(private readonly client: BaseClient) {}

  /** Create a Message. With `stream:true`, returns a `MessageStream`. */
  create(
    params: MessageCreateParams & { stream?: false },
    options?: MessageRequestOptions,
  ): Promise<Message>;
  create(
    params: MessageCreateParams & { stream: true },
    options?: MessageRequestOptions,
  ): MessageStream;
  create(
    params: MessageCreateParams,
    options?: MessageRequestOptions,
  ): Promise<Message> | MessageStream;
  create(
    params: MessageCreateParams,
    options: MessageRequestOptions = {},
  ): Promise<Message> | MessageStream {
    if (params.stream) {
      return this.stream(params, options);
    }
    return this.createNonStreaming(params, options);
  }

  private async createNonStreaming(
    params: MessageCreateParams,
    options: MessageRequestOptions,
  ): Promise<Message> {
    const { data, meta } = await this.client.post<Message>(
      "/v1/messages",
      params,
      options,
    );
    data._request_id = meta.requestId;
    return data;
  }

  /**
   * Stream a Message, returning a `MessageStream`: async-iterable over typed
   * events, with `.on("text"|"message"|...)`, `.textStream`, and
   * `await stream.finalMessage()`.
   *
   * The HTTP request is dispatched eagerly, but the body is not consumed until
   * the stream is iterated / `finalMessage()` is awaited — so listeners attached
   * synchronously after this call still receive every event.
   */
  stream(
    params: MessageStreamParams,
    options: MessageRequestOptions = {},
  ): MessageStream {
    const responsePromise = this.client.stream({
      method: "post",
      path: "/v1/messages",
      body: { ...params, stream: true },
      ...options,
    });
    return new MessageStream(responsePromise);
  }

  /** Count the input tokens a request would consume (an estimate). */
  async countTokens(
    params: CountTokensParams,
    options: MessageRequestOptions = {},
  ): Promise<TokenCount> {
    const { data } = await this.client.post<TokenCount>(
      "/v1/messages/count_tokens",
      params,
      options,
    );
    return data;
  }
}
