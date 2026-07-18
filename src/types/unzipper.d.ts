declare module "unzipper" {
  import { Readable } from "node:stream";

  export interface ParsedEntry extends Readable {
    path: string;
    type: string;
    autodrain(): Readable;
  }

  export interface ParseOptions {
    forceStream?: boolean;
  }

  export function Parse(options?: ParseOptions): NodeJS.ReadWriteStream & AsyncIterable<ParsedEntry>;

  const unzipper: {
    Parse: typeof Parse;
  };

  export default unzipper;
}
