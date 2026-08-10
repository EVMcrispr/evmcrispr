# lang module

Language primitives: string, number, bytes, array, and boolean helpers for data manipulation. Requires `load lang` (import the helpers you use, e.g. `load lang [@map @filter]`, or qualify them as `@lang:map`).

```evml
load lang
```

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@lang:all](src/helpers/all.md) | `bool` | Whether every element satisfies the predicate. |
| [@lang:any](src/helpers/any.md) | `bool` | Whether at least one element satisfies the predicate. |
| [@lang:at](src/helpers/at.md) | `any` | Access an element by index in an array. |
| [@lang:bytes.at](src/helpers/bytes.at.md) | `bytes` | Access a single byte by index in a bytes value. |
| [@lang:bytes.concat](src/helpers/bytes.concat.md) | `bytes` | Concatenate bytes values together. |
| [@lang:bytes.len](src/helpers/bytes.len.md) | `number` | Byte length of a bytes value (a UTF-8 character may span several bytes). |
| [@lang:bytes.not](src/helpers/bytes.not.md) | `bytes` | Bitwise NOT of a bytes value (256-bit complement). |
| [@lang:bytes.slice](src/helpers/bytes.slice.md) | `bytes` | Extract a byte range from a bytes value. |
| [@lang:concat](src/helpers/concat.md) | `array` | Concatenate arrays together. |
| [@lang:enumerate](src/helpers/enumerate.md) | `array` | Pair every element of an array with its index. |
| [@lang:filter](src/helpers/filter.md) | `array` | Keep elements of an array for which a helper returns truthy. |
| [@lang:find](src/helpers/find.md) | `any` | First element that satisfies the predicate; no match is an error. |
| [@lang:flat](src/helpers/flat.md) | `array` | Flatten one level of nesting in an array. |
| [@lang:includes](src/helpers/includes.md) | `bool` | Check whether an array contains an element. |
| [@lang:keys](src/helpers/keys.md) | `array` | Entry names of a record (`[a:1 b:2]` or `[name value]` pairs), as an array. |
| [@lang:len](src/helpers/len.md) | `number` | Length of a value: element count for an array, byte length for a string or bytes. |
| [@lang:lookup](src/helpers/lookup.md) | `any` | Look up an entry by name in a record (`[a:1 b:2]` or `[name value]` pairs). |
| [@lang:map](src/helpers/map.md) | `array` | Transform each element of an array by applying a helper. |
| [@lang:num.format](src/helpers/num.format.md) | `string` | Format a number with decimal places (like formatUnits). |
| [@lang:num.parse](src/helpers/num.parse.md) | `number` | Parse a decimal string with a given number of decimals (like parseUnits). |
| [@lang:reduce](src/helpers/reduce.md) | `any` | Reduce an array to a single value by applying a helper. |
| [@lang:reverse](src/helpers/reverse.md) | `array` | Reverse the order of an array's elements. |
| [@lang:slice](src/helpers/slice.md) | `array` | Extract a section of an array. |
| [@lang:sort](src/helpers/sort.md) | `array` | Sort an array using a comparator helper. |
| [@lang:str.at](src/helpers/str.at.md) | `string` | Access a character by index in a string. |
| [@lang:str.charset](src/helpers/str.charset.md) | `bool` | Check whether every byte of a string is in a character class (ranges like `a-z0-9-`; a leading or trailing dash is the literal `-`). |
| [@lang:str.concat](src/helpers/str.concat.md) | `string` | Concatenate strings together. |
| [@lang:str.includes](src/helpers/str.includes.md) | `bool` | Check whether a string contains a substring (exact byte sequence, case-sensitive). |
| [@lang:str.join](src/helpers/str.join.md) | `string` | Join array elements into a string with a delimiter. |
| [@lang:str.len](src/helpers/str.len.md) | `number` | Length of a string. |
| [@lang:str.lower](src/helpers/str.lower.md) | `string` | Convert a string to lowercase. |
| [@lang:str.replace](src/helpers/str.replace.md) | `string` | Replace all occurrences of a substring (every non-overlapping left-to-right match). |
| [@lang:str.slice](src/helpers/str.slice.md) | `string` | Extract a section of a string. |
| [@lang:str.split](src/helpers/str.split.md) | `array \| string` | Split a string by a delimiter into an array of strings, or select one segment when an index is given. |
| [@lang:str.upper](src/helpers/str.upper.md) | `string` | Convert a string to uppercase. |
| [@lang:sum](src/helpers/sum.md) | `number` | Sum the elements of an array. |
| [@lang:unique](src/helpers/unique.md) | `array` | Remove duplicates from an array, preserving first-occurrence order. |
| [@lang:unzip](src/helpers/unzip.md) | `array` | Transpose an array of pairs into two separate arrays. |
| [@lang:values](src/helpers/values.md) | `array` | Entry values of a record (`[a:1 b:2]` or `[name value]` pairs), as an array. |
| [@lang:zip](src/helpers/zip.md) | `array` | Combine two arrays element-wise into an array of pairs. |

