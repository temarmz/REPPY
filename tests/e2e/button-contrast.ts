import type { Locator } from '@playwright/test';

export function buttonContrast(button: Locator) {
  return button.evaluate(element => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const color = (value: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const blend = (foreground: number[], background: number[]) => foreground.slice(0, 3)
      .map((channel, index) => channel * foreground[3] / 255 + background[index] * (1 - foreground[3] / 255));
    const ancestors: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
    let background = [255, 255, 255];
    for (const node of ancestors) background = blend(color(getComputedStyle(node).backgroundColor), background);
    const foreground = blend(color(getComputedStyle(element).color), background);
    const luminance = (rgb: number[]) => rgb.map(channel => channel / 255)
      .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const a = luminance(foreground);
    const b = luminance(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
}
