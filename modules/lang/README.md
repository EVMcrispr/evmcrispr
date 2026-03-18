# lang module

Language primitives: string, number, bytes, array, and boolean helpers for data manipulation. Requires `load lang`.

```evml
load lang
```

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@all](src/helpers/all.md) | `bool` | Return true if every element satisfies the predicate. |
| [@any](src/helpers/any.md) | `bool` | Return true if at least one element satisfies the predicate. |
| [@at](src/helpers/at.md) | `any` | Access an element by index in an array. |
| [@bytes.at](src/helpers/bytes.at.md) | `bytes` | Access a single byte by index in a bytes value. |
| [@bytes.concat](src/helpers/bytes.concat.md) | `bytes` | Concatenate bytes values together. |
| [@bytes.len](src/helpers/bytes.len.md) | `number` | Return the byte length of a bytes value. |
| [@bytes.not](src/helpers/bytes.not.md) | `bytes` | Bitwise NOT of a bytes value (256-bit complement). |
| [@bytes.slice](src/helpers/bytes.slice.md) | `bytes` | Extract a byte range from a bytes value. |
| [@concat](src/helpers/concat.md) | `array` | Concatenate arrays together. |
| [@enumerate](src/helpers/enumerate.md) | `array` | Return an array of [index, element] pairs. |
| [@filter](src/helpers/filter.md) | `array` | Keep elements of an array for which a helper returns truthy. |
| [@find](src/helpers/find.md) | `any` | Return the first element that satisfies the predicate. |
| [@flat](src/helpers/flat.md) | `array` | Flatten one level of nesting in an array. |
| [@includes](src/helpers/includes.md) | `bool` | Check whether an array contains an element. |
| [@len](src/helpers/len.md) | `number` | Return the length of an array. |
| [@map](src/helpers/map.md) | `array` | Transform each element of an array by applying a helper. |
| [@num.format](src/helpers/num.format.md) | `string` | Format a number with decimal places (like formatUnits). |
| [@num.parse](src/helpers/num.parse.md) | `number` | Parse a decimal string with a given number of decimals (like parseUnits). |
| [@reduce](src/helpers/reduce.md) | `any` | Reduce an array to a single value by applying a helper. |
| [@reverse](src/helpers/reverse.md) | `array` | Return a new array with elements in reverse order. |
| [@slice](src/helpers/slice.md) | `array` | Extract a section of an array. |
| [@sort](src/helpers/sort.md) | `array` | Sort an array using a comparator helper. |
| [@str.at](src/helpers/str.at.md) | `string` | Access a character by index in a string. |
| [@str.concat](src/helpers/str.concat.md) | `string` | Concatenate strings together. |
| [@str.includes](src/helpers/str.includes.md) | `bool` | Check whether a string contains a substring. |
| [@str.join](src/helpers/str.join.md) | `string` | Join array elements into a string with a delimiter. |
| [@str.len](src/helpers/str.len.md) | `number` | Return the length of a string. |
| [@str.lower](src/helpers/str.lower.md) | `string` | Convert a string to lowercase. |
| [@str.replace](src/helpers/str.replace.md) | `string` | Replace all occurrences of a substring. |
| [@str.slice](src/helpers/str.slice.md) | `string` | Extract a section of a string. |
| [@str.split](src/helpers/str.split.md) | `array` | Split a string by a delimiter into an array of strings. |
| [@str.upper](src/helpers/str.upper.md) | `string` | Convert a string to uppercase. |
| [@unique](src/helpers/unique.md) | `array` | Remove duplicates from an array, preserving first-occurrence order. |
| [@unzip](src/helpers/unzip.md) | `array` | Transpose an array of pairs into two separate arrays. |
| [@zip](src/helpers/zip.md) | `array` | Combine two arrays element-wise into an array of pairs. |

