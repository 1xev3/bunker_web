function findVariantBounds(value) {
  let start = -1;
  let depth = 0;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (char !== '}') continue;
    if (depth === 0) {
      throw new Error('лишняя закрывающая скобка "}"');
    }
    depth -= 1;
    if (depth === 0) return { start, end: i };
  }

  if (depth !== 0) {
    throw new Error('не хватает закрывающей скобки "}"');
  }

  return null;
}

function splitVariantOptions(value) {
  const options = [];
  let depth = 0;
  let current = '';

  for (const char of value) {
    if (char === '{') {
      depth += 1;
      current += char;
      continue;
    }
    if (char === '}') {
      if (depth === 0) throw new Error('лишняя закрывающая скобка "}" внутри варианта');
      depth -= 1;
      current += char;
      continue;
    }
    if (char === '|' && depth === 0) {
      options.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  if (depth !== 0) {
    throw new Error('нехватка закрывающей скобки внутри варианта');
  }

  options.push(current);
  if (options.length < 2) {
    throw new Error('вариант должен содержать минимум две опции через "|"');
  }
  if (options.some(option => option.trim() === '')) {
    throw new Error('вариант не должен содержать пустые опции');
  }
  return options;
}

function expandVariantString(value) {
  const source = String(value ?? '');
  const bounds = findVariantBounds(source);
  if (!bounds) return [source];

  const prefix = source.slice(0, bounds.start);
  const suffix = source.slice(bounds.end + 1);
  const inner = source.slice(bounds.start + 1, bounds.end);
  const options = splitVariantOptions(inner);

  return options.flatMap(option => expandVariantString(`${prefix}${option}${suffix}`));
}

function validateVariantString(value) {
  expandVariantString(value);
}

function withVariantId(item, variantIndex) {
  if (!item?.id || variantIndex === 0) return item;
  return { ...item, id: `${item.id}_${variantIndex + 1}` };
}

function expandBackpackItemVariants(item) {
  if (typeof item === 'string') {
    return expandVariantString(item);
  }

  if (Array.isArray(item)) {
    const [label, min, max] = item;
    return expandVariantString(label).map(expanded => [expanded, min, max]);
  }

  if (item && typeof item === 'object' && !Array.isArray(item) && typeof item.label === 'string') {
    return expandVariantString(item.label).map((expanded, index) => ({
      ...withVariantId(item, index),
      label: expanded,
    }));
  }

  return [item];
}

module.exports = {
  expandVariantString,
  validateVariantString,
  expandBackpackItemVariants,
};
