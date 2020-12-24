/**
 * interfaces
 */

/* Node modules */

/* Third-party modules */

/* Files */

export interface IOpenFaaSInvokeResult {
  contentType: string;
  data: any;
}

export interface IOpenFaaS {
  invoke(message: any): Promise<IOpenFaaSInvokeResult>;
}

export interface IOpenFaaSConfig {
  async: boolean;
  callbackUrl?: string;
  function: string;
  gateway: string;
  password?: string;
  username?: string;
}
