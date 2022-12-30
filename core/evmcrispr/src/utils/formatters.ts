export const commaListItems = (items: any[]): string => {
  if (items.length === 1) {
    return items.join(', ');
  }

  const someItems = items.slice(0, items.length - 1).join(', ');

  return `${someItems} and ${items[items.length - 1]}`;
};

export const listItems = (text: string, items: any[]): string => {
  const formattedItems = items.map((i) => `- ${i}\n`);

  return `${text}:\n${formattedItems.join('')}`;
};
