/*  TODOs

Representation base classe and handler parseing representations
ResourceResponse implemntations

*/

import { Service, ServiceInterface } from './service';
import { Router, Express, Request, Response } from 'express';
import { Identity } from './identity';
import { ResourceAuthorizer } from './resourceAuthorizer'
import { ResourceRequest, ResourceId } from './resourceRequest';
import { Representation } from './representation';
import { ResourceResponse } from './responses/resourceResponse';
import { ServerErrorResponse } from './responses/serverErrorResponse';
import { ClientErrorResponse } from './responses/clientErrorResponse';

export enum Method {
  GET = "GET", // get a specific resource
  PUT = "PUT", // put a specific resource
  // post a resrouce to create. Any other use of post should have it's own
  // custom method
  POST = "POST",
  DELETE = "DELETE", // delete a specific resource
  GET_ALL = "GET_ALL" // get all on resources
}

const METHOD_HANDLERS = new Map<Method, string>([
  [Method.GET, "onGetAll"],
  [Method.GET_ALL, "onGetAll"],
  [Method.PUT, "onPut"],
  [Method.POST, "onPost"],
  [Method.DELETE, "onDelete"]
]);

export interface ResourceAccessInfo {
  isAuthenticated: boolean;
  supportedRoles: string[]
}

export abstract class ResourceHandler {
  private service: Service;
  private parentHandler?: ResourceHandler;
  private router: Router;

  private resourceName: string;
  private paramId: string;
  private accessInfo = new Map<Method | string, ResourceAccessInfo>();
  private customMethodNames: string[] = [];
  private allMethodNames: (Method | string)[] = [];
  private methodHandlers = new Map<Method,
    (request: ResourceRequest) => Promise<ResourceResponse>>();
  private allResourceHandlers: ResourceHandler[] = [];
  private allResourceIdClasses: (typeof ResourceId)[] = [];
  private representationClasses = new Map<number, typeof Representation>();
  private customRepresentationClasses = new Map<Method | string,
    Map<number, typeof Representation>>();

  public constructor(service: ServiceInterface, parentHandler?: ResourceHandler) {
    this.service = service as Service;
    this.parentHandler = parentHandler;


    this.resourceName = this.getResourceIdentifierInPlural();
    this.paramId = `${this.resourceName}Id`;
    this.parseCustomMethods();
    this.parseAccessInfo();

    this.setupMethodHandlers();
    this.setupParentHandlers();
    this.setupRepresentationClasses();

    if (parentHandler == undefined) {
      this.router = Router();
      this.service.registerRootResourceHandler(this, this.router);
    } else {
      this.router = Router({ mergeParams: true });
      parentHandler.getRouter().use(
        `/:${parentHandler.getParamId()}/${this.getResourceIdentifierInPlural()}
        `,
        this.router
      )
    }
  }

  public getParamId(): string {
    return this.paramId;
  }

  public getService(): ServiceInterface {
    return this.service;
  }

  protected getRouter(): Router {
    return this.router;
  }

  private parseAccessInfo() {
    this.allMethodNames.forEach((method: Method | string) => {
      this.accessInfo.set(method, {
        isAuthenticated: this.isAuthenticated(method),
        supportedRoles: this.getAuthorizationRoles(method).sort()
      })
    });
  }

  private setupRepresentationClasses() {
    this.service.getSupportedVersions().forEach((version) => {
      this.representationClasses.set(
        version,
        this.getRepresentationClass(version)
      );
      this.customMethodNames.forEach((method) => {
        let custom = this.customRepresentationClasses.get(method);
        if (custom == undefined) {
          custom = new Map<number, typeof Representation>();
          this.customRepresentationClasses.set(method, custom);
        }
        custom.set(version, this.getRepresentationClassForCustomMethod(
          method,
          version
        ));
      })
    })
  }

  private parseCustomMethods() {
    METHOD_HANDLERS.forEach((_: string, method: Method) => {
      this.allMethodNames.push(method);
    })
    const arr = this.getCustomMethods();
    arr.forEach((method) => {
      if (METHOD_HANDLERS.has(method as Method)) {
        throw new Error(`Invalid custom method name ${method}`);
      }
      this.customMethodNames.push(method);
      this.allMethodNames.push(method);
    })
  }

  // Setting up ancestry
  private setupParentHandlers() {
    let curHandler: ResourceHandler | undefined = this;
    while (curHandler != undefined) {
      this.allResourceHandlers.push(curHandler);
      this.allResourceIdClasses.push(curHandler.getResourceIdClass());
      curHandler = curHandler.parentHandler;
    }
    this.allResourceHandlers.reverse();
    this.allResourceIdClasses.reverse();
  }

  // Setup endpoints
  private setupMethodHandlers() {
    // setup methods
    this.onMethod = this.onMethod.bind(this);
    METHOD_HANDLERS.forEach((handlerName, method: Method) => {
      const func = (this as any)[handlerName] as
        (request: ResourceRequest) => Promise<ResourceResponse>;
      if (func == undefined) {
        throw new Error(`Method handler ${handlerName} does not exist`);
      }
      this.methodHandlers.set(method, func.bind(this));
    });

    let authorizers = new Map<Method, ResourceAuthorizer>();
    METHOD_HANDLERS.forEach((_: string, method: Method) => {
      const authorizer = new ResourceAuthorizer(
        this,
        this.onMethod,
        this.accessInfo.get(method) as ResourceAccessInfo,
        method
      )
      authorizers.set(method, authorizer);
    });

    this.router.get(
      '/',
      (<ResourceAuthorizer>authorizers.get(Method.GET_ALL)).handler
    );

    this.router.get(
      `/:${this.paramId}`,
      (<ResourceAuthorizer>authorizers.get(Method.GET)).handler
    );

    this.router.put(
      `/:${this.paramId}`,
      (<ResourceAuthorizer>authorizers.get(Method.PUT)).handler
    );

    this.router.post(
      '/',
      (<ResourceAuthorizer>authorizers.get(Method.POST)).handler
    );

    this.router.delete(
      `/:${this.paramId}`,
      (<ResourceAuthorizer>authorizers.get(Method.DELETE)).handler
    );

    // Custom handlers
    let customAuthorizers = new Map<string, ResourceAuthorizer>();
    this.customMethodNames.forEach((method) => {
      const auth = new ResourceAuthorizer(
        this,
        this.onMethod,
        this.accessInfo.get(method) as ResourceAccessInfo,
        method
      )
      customAuthorizers.set(method, auth);
    })
    this.router.post(
      `/:${this.paramId}`,
      (req: Request, res: Response) => {
        const method: string | undefined = req.query.method;
        if (method == undefined) {
          const errorResponse = ServerErrorResponse.notImplemented();
          errorResponse.send(res);
        } else {
          const authorizer = customAuthorizers.get(method);
          if (authorizer == undefined) {
            const errorResponse = ServerErrorResponse.notImplemented();
            errorResponse.send(res);
          } else {
            authorizer.handler(req, res);
          }
        }
      }
    );
  }

  // Handler for all method requests
  private async onMethod(
    method: Method | string,
    req: Request,
    res: Response,
    identity?: Identity
  ) {
    let response: ResourceResponse;

    // Validate media types
    if (req.headers.accept != "application/json") {
      response = ClientErrorResponse.notAcceptable();
    } else if (req.headers["content-type"] != "application/json") {
      response = ClientErrorResponse.unsupportedMediaType();
    }

    const func = this.methodHandlers.get(method as Method);
    const version = req.params[Service.getVersionParamId()];
    let representationClass: typeof Representation;

    // get the correct representation calss
    if (func != undefined) { // in-build method
      representationClass = this.representationClasses.get(version) as
        typeof Representation;
    } else { // custom method
      representationClass = (<any>this.customRepresentationClasses.get(method)).
        get(version) as typeof Representation;;
    }

    // recieved API version is not supposed
    if (representationClass == undefined) {
      return Promise.resolve(ClientErrorResponse.badRequest(
        `version ${version} not supported.`
      ));
    }

    // extract representation
    // req.body.data can be an array of representations
    // In such case there need to be additioanl req.body.isArray flag
    let representation: Representation | undefined;
    let representations: Representation[] = [];
    // payload have a top level "data" key
    const data = req.body.data;
    const isArray = req.body.isArray;
    if (method == Method.POST || method == Method.PUT) {
      if (data == null) {
        return Promise.resolve(ClientErrorResponse.unprocessableEnitity(
          "No represetnation."
        ));
      }
    }
    if (isArray == true && method != Method.POST) {
      return Promise.resolve(ClientErrorResponse.unprocessableEnitity(
        "Can't PUT an array of representations."
      ));
    }
    if (data != null) {
      try {
        if (isArray) {
          if (!Array.isArray(data)) {
            throw new Error("Not an array.");
          }
          data.forEach((item) => {
            representations.push(representationClass.parse(item));
          })
        } else {
          representation = representationClass.parse(data);
        }
      } catch (e) {
        return Promise.resolve(ClientErrorResponse.unprocessableEnitity(
          e.message
        ))
      }
    }

    let request: ResourceRequest = new ResourceRequest(
      req,
      this.allResourceHandlers,
      this.allResourceIdClasses,
      version,
      isArray == true ? representations : representation,
      identity
    );

    // TODO
    // Call the correct handler with the generated request
    try {
      if (func != undefined) {
        response = await func(request);
      } else {
        response = await this.onCustomMethod(method, request);
      }
    } catch (e) {
      return Promise.resolve(
        ServerErrorResponse.internalServerError(e)
      )
    }

    if (method == Method.GET_ALL) {
      // TODO check where reponse is an array of representations
    }

    response.send(res);
  }

  // TODO abstract get, put, post and delete : each returning ResourcrResponse

  // Returns the resource name
  public abstract getResourceIdentifierInPlural(): string;

  protected getCustomMethods(): string[] {
    return [];
  }

  protected abstract getRepresentationClass(
    version: number
  ): typeof Representation;

  // TODO
  // Posts can have a dedicated query key called "method". For each method we
  // should be able to set representations separately. If client doesn't pass
  // an ID then the method has to be create
  protected getRepresentationClassForCustomMethod(
    method: string,
    version: number
  ): typeof Representation {
    return this.getRepresentationClass(version);
  }

  protected abstract isAuthenticated(
    method: Method | string
  ): boolean;

  protected abstract getAuthorizationRoles(method: Method | string): string[];

  protected getResourceIdClass(): typeof ResourceId {
    return ResourceId;
  }

  protected abstract async onGetAll(
    request: ResourceRequest
  ): Promise<ResourceResponse>;
  protected abstract async onGet(
    request: ResourceRequest
  ): Promise<ResourceResponse>;
  protected abstract async onPut(
    request: ResourceRequest
  ): Promise<ResourceResponse>;
  protected abstract async onPost(
    request: ResourceRequest
  ): Promise<ResourceResponse>;
  protected abstract async onDelete(
    request: ResourceRequest
  ): Promise<ResourceResponse>;
  protected abstract async onCustomMethod(
    method: string,
    request: ResourceRequest
  ): Promise<ResourceResponse>;
}