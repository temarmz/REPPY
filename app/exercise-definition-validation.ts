export type DefinitionInput = {
  id?: string;
  name: string;
  equipment: string;
  muscleGroups: readonly string[];
};

export function exerciseDefinitionError(input: DefinitionInput, definitions: readonly { id: string; name: string }[]): string | undefined {
  const name = input.name.trim();
  if (Array.from(name).length < 2 || Array.from(name).length > 160) return 'Укажи название длиной от 2 до 160 символов.';
  const equipmentLength = Array.from(input.equipment.trim()).length;
  if (equipmentLength > 0 && (equipmentLength < 2 || equipmentLength > 100)) return 'Укажи оборудование длиной от 2 до 100 символов или оставь поле пустым.';
  if (!input.muscleGroups.length) return 'Выбери хотя бы одну группу мышц.';
  if (definitions.some(item => item.id !== input.id && item.name.trim().toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))) return 'Упражнение с таким названием уже есть.';
  return undefined;
}
