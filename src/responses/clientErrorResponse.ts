import { ErrorResponse } from './errorResponse';

export enum ClientErrorHttpStatusCode {
  badRequest = 400,
  unauthorized = 401,
  forbidden = 403,
  notFound = 404,
  methodNotAllowed = 405,
  notAcceptable = 406,
  conflict = 409,
  unsupportedMediaType = 415,
  unprocessableEntity = 422
}

const ClientErrorMessages = new Map<number, string>([
  [ClientErrorHttpStatusCode.badRequest, "Bad Request"],
  [ClientErrorHttpStatusCode.unauthorized, "Unauthorized"],
  [ClientErrorHttpStatusCode.forbidden, "Forbidden"],
  [ClientErrorHttpStatusCode.notFound, "Not Found"],
  [ClientErrorHttpStatusCode.methodNotAllowed, "Method Not Allowed"],
  [ClientErrorHttpStatusCode.notAcceptable, "Not Acceptable"],
  [ClientErrorHttpStatusCode.conflict, "Conflict"],
  [ClientErrorHttpStatusCode.unsupportedMediaType, "Unsupported Media Type"],
  [ClientErrorHttpStatusCode.unprocessableEntity, "Unprocessable Entity"]
]);

export class ClientErrorResponse extends ErrorResponse {

  protected constructor(statusCode: number, errorMessage?: string) {
    if (errorMessage == undefined) {
      errorMessage = ClientErrorMessages.get(statusCode);
    }
    if (errorMessage == undefined) {
      errorMessage = "Client Error";
    }
    super(statusCode, errorMessage);
  }

  /**
   * 400 Bad Request.
   * General bad request, not symantic or syntax error
   */
  public static badRequest(errorMessage?: string) {
    return new ClientErrorResponse(
      ClientErrorHttpStatusCode.badRequest,
      errorMessage
    )
  }

  /**
   * 401 Unauthorized.
   *  Client must authenticate. Authorization is covered by Forbidden
   */
  public static unauthorized() {
    return new ClientErrorResponse(
      ClientErrorHttpStatusCode.unauthorized
    )
  }

  /**
   * 403 Forbidden.
   * Unauthorized to access the given method.
   */
  public static forbidden() {
    return new ClientErrorResponse(
      ClientErrorHttpStatusCode.forbidden
    )
  }

  /**
   * 404 Not Found.
   *  Resource couldn't be found or not authoized
   */
  public static notFound() {
    return new ClientErrorResponse(
      ClientErrorHttpStatusCode.notFound
    )
  }

  /**
   * 405 Method Not Allowed.
   * When one of the GET, GET_ALL, POST, PUT, POST not implemented
   */
  public static methodNotAllowed() {
    return new ClientErrorResponse(
      ClientErrorHttpStatusCode.methodNotAllowed
    )
  }

  /**
   * 406 Not Acceptable.
   * Media-type on accept can't be served
   */
  public static notAcceptable() {
    return new ClientErrorResponse(
      ClientErrorHttpStatusCode.notAcceptable
    )
  }

  /**
   * 409 Conflict.
   * Request conflicts with the current state of the server.
   */
  public static conflict(errorMessage?: string) {
    return new ClientErrorResponse(
      ClientErrorHttpStatusCode.conflict,
      errorMessage
    )
  }

  /**
   * 415 Unsupported Media Type.
   * Content-type is not supported. Should be application/json
   */
  public static unsupportedMediaType() {
    return new ClientErrorResponse(
      ClientErrorHttpStatusCode.unsupportedMediaType
    )
  }

  /**
   * 422 Unprocessable Entity.
   * Folllows content-type but sematics are invalid - i.e. schema issue
   */
  public static unprocessableEntity(errorMessage?: string) {
    return new ClientErrorResponse(
      ClientErrorHttpStatusCode.unprocessableEntity,
      errorMessage
    )
  }
}