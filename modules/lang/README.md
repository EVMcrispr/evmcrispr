# lang module

Language primitives: string, number, bytes, array, and boolean helpers for data manipulation. Requires `load lang` (import the helpers you use, e.g. `load lang [@map @filter]`, or qualify them as `@lang:map`).

```evml
load lang
```

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@lang:all](src/helpers/all.md) | `bool` | Return true if every element satisfies the predicate. As @all! a foldWords over the array return of a call with the All exit — the predicate names an Operators-backed helper (e.g. `@bool!(> 0)`, the element prepended to its arguments) compiled into a single-call lambda template. |
| [@lang:any](src/helpers/any.md) | `bool` | Return true if at least one element satisfies the predicate. As @any! a foldWords over the array return of a call with the Any exit — the predicate names an Operators-backed helper (e.g. `@bool!(> 0)`, the element prepended to its arguments) compiled into a single-call lambda template. |
| [@lang:at](src/helpers/at.md) | `any` | Access an element by index in an array. As @at! an element of the array return of a call, selected on-chain through a typed nav — negative indexes resolve against the live length at assertion time. |
| [@lang:bytes.at](src/helpers/bytes.at.md) | `bytes` | Access a single byte by index in a bytes value. |
| [@lang:bytes.concat](src/helpers/bytes.concat.md) | `bytes` | Concatenate bytes values together. |
| [@lang:bytes.len](src/helpers/bytes.len.md) | `number` | Return the byte length of a bytes value. As @bytes.len! the decoded byte length of the string/bytes return of a call, on-chain — UTF-8 characters may span multiple bytes. |
| [@lang:bytes.not](src/helpers/bytes.not.md) | `bytes` | Bitwise NOT of a bytes value (256-bit complement). |
| [@lang:bytes.slice](src/helpers/bytes.slice.md) | `bytes` | Extract a byte range from a bytes value. |
| [@lang:concat](src/helpers/concat.md) | `array` | Concatenate arrays together. |
| [@lang:enumerate](src/helpers/enumerate.md) | `array` | Return an array of [index, element] pairs. |
| [@lang:filter](src/helpers/filter.md) | `array` | Keep elements of an array for which a helper returns truthy. |
| [@lang:find](src/helpers/find.md) | `any` | Return the first element that satisfies the predicate. |
| [@lang:flat](src/helpers/flat.md) | `array` | Flatten one level of nesting in an array. |
| [@lang:includes](src/helpers/includes.md) | `bool` | Check whether an array contains an element. As @includes! the array return of a call is scanned on-chain: a foldWords over the word payload with an eq(item, element) lambda and the Any exit. |
| [@lang:keys](src/helpers/keys.md) | `array` | Return the entry names of a record (`[a:1 b:2]` or `[name value]` pairs) as an array. |
| [@lang:len](src/helpers/len.md) | `number` | Return the length of an array. As @len! the decoded length of the dynamic return value of a call, on-chain: element count for arrays, byte length for string/bytes. |
| [@lang:lookup](src/helpers/lookup.md) | `any` | Look up an entry by name in a record (`[a:1 b:2]` or `[name value]` pairs). |
| [@lang:map](src/helpers/map.md) | `array` | Transform each element of an array by applying a helper. |
| [@lang:num.format](src/helpers/num.format.md) | `string` | Format a number with decimal places (like formatUnits). |
| [@lang:num.parse](src/helpers/num.parse.md) | `number` | Parse a decimal string with a given number of decimals (like parseUnits). |
| [@lang:reduce](src/helpers/reduce.md) | `any` | Reduce an array to a single value by applying a helper. As @reduce! a foldWords over the array return of a call with a binary Operators lambda — add, min, max, bitOr or bitAnd — and a build-time initial accumulator. |
| [@lang:reverse](src/helpers/reverse.md) | `array` | Return a new array with elements in reverse order. |
| [@lang:slice](src/helpers/slice.md) | `array` | Extract a section of an array. |
| [@lang:sort](src/helpers/sort.md) | `array` | Sort an array using a comparator helper. |
| [@lang:str.at](src/helpers/str.at.md) | `string` | Access a character by index in a string. As @str.at! a one-byte slice of the string return of a call, on-chain — negative indexes resolve against the live byte length at assertion time. |
| [@lang:str.charset](src/helpers/str.charset.md) | `bool` | Check whether every byte of a string is in a character class (ranges like `a-z0-9-`; a leading or trailing dash is the literal `-`). As @str.charset! the string return of a call is checked on-chain with the same byte-level semantics. |
| [@lang:str.concat](src/helpers/str.concat.md) | `string` | Concatenate strings together. |
| [@lang:str.includes](src/helpers/str.includes.md) | `bool` | Check whether a string contains a substring. As @str.includes! the string return of a call is checked on-chain — exact byte sequence, case-sensitive, no wildcards. |
| [@lang:str.join](src/helpers/str.join.md) | `string` | Join array elements into a string with a delimiter. |
| [@lang:str.len](src/helpers/str.len.md) | `number` | Return the length of a string. As @str.len! the decoded byte length of the string return of a call, on-chain — there is no code-point walk at assertion time, so multi-byte UTF-8 characters count once per byte. |
| [@lang:str.lower](src/helpers/str.lower.md) | `string` | Convert a string to lowercase. |
| [@lang:str.replace](src/helpers/str.replace.md) | `string` | Replace all occurrences of a substring. |
| [@lang:str.slice](src/helpers/str.slice.md) | `string` | Extract a section of a string. As @str.slice! a byte range of the string/bytes return of a call, sliced on-chain — negative indexes resolve against the live byte length at assertion time. |
| [@lang:str.split](src/helpers/str.split.md) | `array \| string` | Split a string by a delimiter into an array of strings, or select one segment when an index is given. As @str.split! the string return of a call is split on-chain and the indexed segment selected (the index is required there). |
| [@lang:str.upper](src/helpers/str.upper.md) | `string` | Convert a string to uppercase. |
| [@lang:unique](src/helpers/unique.md) | `array` | Remove duplicates from an array, preserving first-occurrence order. |
| [@lang:unzip](src/helpers/unzip.md) | `array` | Transpose an array of pairs into two separate arrays. |
| [@lang:values](src/helpers/values.md) | `array` | Return the entry values of a record (`[a:1 b:2]` or `[name value]` pairs) as an array. |
| [@lang:zip](src/helpers/zip.md) | `array` | Combine two arrays element-wise into an array of pairs. |

