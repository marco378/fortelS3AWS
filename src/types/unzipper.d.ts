declare module "unzipper" {
  import { Readable } from "node:stream";

  interface ParseOptions {
    forceStream?: boolean;
  }

  export interface ParsedEntry extends Readable {
    path: string;
    type: string;
    autodrain(): Readable;
  }

  export function Parse(options?: ParseOptions): NodeJS.ReadWriteStream & AsyncIterable<ParsedEntry>;

  const unzipper: {
    Parse: typeof Parse;
  };

  export default unzipper;
}
