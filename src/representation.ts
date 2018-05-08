// This should better be abstract always, forcing developer to define messages.

export type SchemaType = "string" | "number" | "boolean" | "object";
export type SchemaProperty = boolean | SchemaObject
export type SchemaObject = {
  _schema: true,
  mandatory: boolean,
  type?: SchemaType;
}
export interface Schema {
  [property: string]: SchemaProperty | Schema;
}

export function validateSchema(
  schema: Schema,
  object: any
): string | undefined {
  const result = validateSchemaFunc(schema, object, "");
  return result;
}

function validateSchemaFunc(
  schema: Schema,
  object: any,
  jsonPath: string
): string | undefined {
  if (object == null) {
    return "Invalid null object"
  }

  for (let key in schema) {
    let def = <SchemaObject>schema[key];
    if (typeof def == "boolean") {
      def = {
        _schema: true,
        mandatory: def
      }
    } else if (<boolean>def._schema != false) {
      const result = validateSchemaFunc(
        schema[key] as Schema,
        object[key],
        `${jsonPath}.${key}`
      );
      if (result != undefined) {
        return result;
      }
    }

    if (def.mandatory && object[key] == undefined) {
      return `Missing property ${jsonPath}.${key}`;
    }
    if (def.type != undefined && def.type != typeof object[key]) {
      return `Invalid type ${def.type} in ${jsonPath}.${key}`
    }
  }

  return undefined;
}

export abstract class Representation {

  public static parse(json: any): Representation {
    throw new Error(
      `parse(json) not implemented in Represetnation ${this.name}`
    );
  }

  // User can implement this if schema needs to be enforced
  public static getSchema(): Schema | undefined {
    return undefined;
  }

  public constructor(json: any) {
  }

  // This doesn't have a default implementation because of robustness concerns.
  // This is supposed to be the one that's genrating output to the client.
  public abstract getJSON(): any;

  // TODO To be done later.
  protected getETag(): string | undefined {
    return undefined;
  }
}