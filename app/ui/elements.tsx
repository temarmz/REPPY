import { createElement, type ComponentProps, type JSX } from 'react';

/**
 * Visual HTML/SVG primitives preserve their native tag, attributes, events and refs.
 * No extra DOM wrappers: child selectors, forms, focus and layout keep their semantics.
 * Shared appearance lives in this directory's tokens.css and styles.css.
 */
function element<Tag extends keyof JSX.IntrinsicElements>(tag: Tag, name: string) {
  function UIElement(props: ComponentProps<Tag>) {
    return createElement(tag, { 'data-ui-element': name, ...props });
  }
  UIElement.displayName = name;
  return UIElement;
}

export const Page = element('main', 'page');
export const Box = element('div', 'box');
export const Section = element('section', 'section');
export const Card = element('article', 'card');
export const Header = element('header', 'header');
export const Footer = element('footer', 'footer');
export const Nav = element('nav', 'navigation');
export const Aside = element('aside', 'aside');
export const Inline = element('span', 'inline');
export const Paragraph = element('p', 'paragraph');
export const PageTitle = element('h1', 'page-title');
export const Heading = element('h2', 'heading');
export const Subheading = element('h3', 'subheading');
export const Strong = element('strong', 'strong');
export const Small = element('small', 'small');
export const Bold = element('b', 'bold');
export const Italic = element('i', 'italic');
export const Emphasis = element('em', 'emphasis');
export const Time = element('time', 'time');
export const Image = element('img', 'image');
export const Video = element('video', 'video');
export const Figure = element('figure', 'figure');
export const FigCaption = element('figcaption', 'figure-caption');
export const List = element('ul', 'list');
export const OrderedList = element('ol', 'ordered-list');
export const ListItem = element('li', 'list-item');
export const DefinitionList = element('dl', 'definition-list');
export const DefinitionTerm = element('dt', 'definition-term');
export const DefinitionValue = element('dd', 'definition-value');
export const Form = element('form', 'form');
export const Label = element('label', 'label');
export const Fieldset = element('fieldset', 'fieldset');
export const Legend = element('legend', 'legend');
export const SelectOption = element('option', 'select-option');
export const Output = element('output', 'output');
export const LineBreak = element('br', 'line-break');
export const Svg = element('svg', 'chart');
export const SvgGroup = element('g', 'chart-group');
export const SvgLine = element('line', 'chart-line');
export const SvgText = element('text', 'chart-text');
export const SvgPolyline = element('polyline', 'chart-series');
export const SvgCircle = element('circle', 'chart-point');
export const SvgRect = element('rect', 'chart-region');
