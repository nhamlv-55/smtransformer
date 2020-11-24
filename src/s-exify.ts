// export interface SExp extends Array<string | SExp> {}
export interface SExpNode {
  token: string,
  startLine: number,
  startOffset: number,
  endLine: number,
  endOffset: number
}
export interface SExp extends Array<SExpNode | SExp> {}
export function parse(input: string): SExp {
  let i = 0;
  let line_number = 0;
  let offset = 0;
  const impl = () => {
    while (input[i].match(/\r\n|\r|\n/)) {
      line_number++; // skip newlines
      i++;
    }
    while (input[i].match(/\s/)) {
      i++; // skip whitespaces
      offset++;
    }
    if (input[i] === "(") {
      // drop '('
      i++;
    } else {
      throw new Error(
        `Input is not valid: unexpected '${input[i]}' at the beginning`
      );
    }

    const result: SExp = [];
    let node = "";
    let startLine = line_number;
    let startOffset = offset;
    let endLine = line_number;
    let endOffset = offset;
    while (true) {
      offset++;
      let c = input[i++];

      if (!c) {
        if (!node) {
          break;
        } else {
          throw new Error(
            `Input is not valid: unexpected '${node}' at the end`
          );
        }
      }

      if (c === ")") {
        if (node) result.push({
          "token": node, 
          "startLine": startLine,
          "startOffset": startOffset,
          "endLine": line_number,
          "endOffset": offset,
        });
        break;
      } else if (c === "\\") {
        c += input[i++];
        node += c;
      } else if (c.match(/\r\n|\r|\n/)) {
        if (node) {
          result.push({
          "token": node, 
          "startLine": startLine,
          "startOffset": startOffset,
          "endLine": line_number,
          "endOffset": offset,
          });
          node = "";
        }
        line_number++;
        offset = 0;
      } else if (c.match(/\s/)) {
        if (node) result.push({
          "token": node, 
          "startLine": startLine,
          "startOffset": startOffset,
          "endLine": line_number,
          "endOffset": offset,
        });
        node = "";
        startLine = line_number;
        startOffset = offset;
      } else if (c === "(") {
        i--;
        offset--;
        result.push(impl());
      } else if (c === '"') {
        node += c;
        // parse string
        while ((c = input[i++])) {
          // skip \"
          if (c === "\\" && input[i] === '"') {
            c += input[i++];
          }
          node += c;
          if (c === '"') break;
        }
      } else {
        node += c;
      }
    }

    return result;
  };

  return impl();
}

function isString(node: any): node is string {
  return typeof node === "string";
}

//dump checker since typescript doesnt have fancy typechecker api
export function isSExpNode(node: any): node is SExpNode {
  return "startOffset" in node;
}

// export function beautify(input: string | SExp): string {
//   const sExp = isString(input) ? parse(input) : input;

//   const stack: Array<{ idx: number; exp: SExp }> = [{ idx: 0, exp: sExp }];
//   let indent = 0;

//   let result = "";
//   const print = (str: string) => {
//     result += "  ".repeat(indent) + str + "\n";
//   };

//   while (stack.length) {
//     const node = stack.pop()!;

//     if (node.idx === 0 && node.exp.length < 5 && node.exp.every(isSExpNode)) {
//       // very short case, just print and it's done
//       print(`(${node.exp.join(" ")})`);
//       continue;
//     }

//     let done = false;

//     while (true) {
//       if (node.idx >= node.exp.length) {
//         done = true;
//         break;
//       }

//       const child = node.exp[node.idx++];

//       if (node.idx === 1) {
//         print(`(${child}`);
//         indent++;
//       } else if (isSExpNode(child)) {
//         print(child.token);
//       } else {
//         stack.push(node);
//         stack.push({ idx: 0, exp: child });
//         break;
//       }
//     }

//     if (done) {
//       indent--;
//       print(")");
//     }
//   }

//   return result.trim();
// }
