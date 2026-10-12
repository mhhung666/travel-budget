import { useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CurrencyPicker, CurrencySearchPanel } from '@/components/trips/CurrencyPicker';
import CurrencyCombobox from '@/components/trips/detail/CurrencyCombobox';
import { Button } from '@/components/ui/button';
import { expectNoSeriousAxeViolations } from '@/test/axe';
import zh from '@/i18n/messages/zh.json';
import cn from '@/i18n/messages/zh-CN.json';
import en from '@/i18n/messages/en.json';
import jp from '@/i18n/messages/jp.json';
import fixture from '../../../../test-fixtures/currency-selection.json';

vi.unmock('next-intl');
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const catalogs = { zh, 'zh-CN': cn, en, jp };
const provider = (children: React.ReactNode, locale: keyof typeof catalogs = 'en') => (
  <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="Asia/Taipei">
    {children}
  </NextIntlClientProvider>
);
function Harness({
  codes = ['TWD', 'JPY', 'USD', 'AED'],
  initial = 'USD',
  onSelect = vi.fn(),
  disabled = false,
}: {
  codes?: string[];
  initial?: string;
  onSelect?: (code: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial);
  return (
    <>
      <output aria-label="Chosen currency">{value}</output>
      <CurrencyPicker
        open={open}
        onOpenChange={setOpen}
        value={value}
        codes={codes}
        disabled={disabled}
        onSelect={(code) => {
          onSelect(code);
          setValue(code);
        }}
        trigger={<Button disabled={disabled}>Currency field</Button>}
      />
    </>
  );
}
const option = (code: string) => screen.getByRole('option', { name: new RegExp(`^${code} `) });
const chosen = () => screen.getByLabelText('Chosen currency');

it('opens on the selected row, with an independent active descendant and a complete grouped list', async () => {
  const scroll = vi.fn();
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scroll });
  const user = userEvent.setup();
  render(provider(<Harness codes={fixture.commonOrder.concat(['AED', 'BHD', 'CAD'])} />));
  await user.click(screen.getByRole('button', { name: 'Currency field' }));
  const input = screen.getByRole('combobox');
  expect(input).toHaveFocus();
  expect(input).toHaveAttribute('aria-activedescendant', option('USD').id);
  expect(option('USD')).toHaveAttribute('aria-selected', 'true');
  expect(screen.getAllByRole('option')).toHaveLength(18);
  expect(screen.getAllByRole('group')).toHaveLength(2);
  expect(screen.getAllByRole('option').map((row) => row.textContent?.slice(0, 3))).toEqual(
    fixture.commonOrder.concat(['AED', 'BHD', 'CAD'])
  );
  expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
  if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original);
  else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

it('arrows and hover change only activity; Enter commits once, closes and restores trigger focus', async () => {
  const select = vi.fn();
  const user = userEvent.setup();
  render(provider(<Harness onSelect={select} />));
  const trigger = screen.getByRole('button', { name: 'Currency field' });
  await user.click(trigger);
  await user.keyboard('{ArrowUp}');
  expect(screen.getByRole('combobox')).toHaveAttribute('aria-activedescendant', option('JPY').id);
  expect(option('USD')).toHaveAttribute('aria-selected', 'true');
  expect(option('JPY')).toHaveAttribute('aria-selected', 'false');
  fireEvent.pointerMove(option('TWD'));
  expect(option('TWD')).toHaveAttribute('aria-selected', 'false');
  expect(chosen()).toHaveTextContent('USD');
  expect(select).not.toHaveBeenCalled();
  await user.keyboard('{Enter}');
  expect(select).toHaveBeenCalledExactlyOnceWith('TWD');
  expect(chosen()).toHaveTextContent('TWD');
  expect(screen.queryByRole('listbox')).toBeNull();
  await waitFor(() => expect(trigger).toHaveFocus());
});

it('search, clear, cancel and reopen keep the controlled value and reset search', async () => {
  const select = vi.fn();
  const user = userEvent.setup();
  render(provider(<Harness onSelect={select} />));
  const trigger = screen.getByRole('button', { name: 'Currency field' });
  await user.click(trigger);
  await user.type(screen.getByRole('combobox'), 'japanese');
  expect(screen.getAllByRole('option')).toHaveLength(1);
  expect(screen.queryByRole('group', { name: en.currencyPicker.common })).toBeNull();
  expect(chosen()).toHaveTextContent('USD');
  await user.click(screen.getByRole('button', { name: en.currencyPicker.clearSearch }));
  expect(screen.getByRole('combobox')).toHaveValue('');
  expect(option('USD')).toHaveAttribute('aria-selected', 'true');
  await user.type(screen.getByRole('combobox'), 'nonsense');
  expect(screen.queryByRole('option')).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent(en.currencyPicker.noMatch);
  expect(screen.getByRole('status')).toHaveTextContent(en.currencyPicker.searchHint);
  await user.keyboard('{Enter}');
  expect(select).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: en.common.cancel }));
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  expect(screen.getByRole('combobox')).toHaveValue('');
  expect(screen.getByRole('combobox')).toHaveAttribute('aria-activedescendant', option('USD').id);
  expect(chosen()).toHaveTextContent('USD');
});

it('selecting the same value closes without changing the chosen value', async () => {
  const user = userEvent.setup();
  render(provider(<Harness />));
  await user.click(screen.getByRole('button', { name: 'Currency field' }));
  await user.click(option('USD'));
  expect(chosen()).toHaveTextContent('USD');
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('Escape cancels without exiting the containing form or choosing a row', async () => {
  const cancel = vi.fn();
  const outer = vi.fn();
  const select = vi.fn();
  render(
    provider(
      <div onKeyDown={outer}>
        <CurrencySearchPanel
          codes={['TWD', 'USD']}
          value="USD"
          onCancel={cancel}
          onSelect={select}
        />
      </div>
    )
  );
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
  expect(cancel).toHaveBeenCalledOnce();
  expect(outer).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});

it('does not select or submit during composition, including the Safari keyCode 229 sequence', () => {
  const select = vi.fn();
  const submit = vi.fn();
  const outerKey = vi.fn();
  render(
    provider(
      <form onSubmit={submit} onKeyDown={outerKey}>
        <CurrencySearchPanel
          codes={['TWD', 'USD']}
          value="TWD"
          onCancel={vi.fn()}
          onSelect={select}
        />
      </form>
    )
  );
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'USD' } });
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
  expect(select).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  expect(outerKey).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(select).toHaveBeenCalledExactlyOnceWith('USD');
  expect(submit).not.toHaveBeenCalled();
  expect(outerKey).not.toHaveBeenCalled();
});

it('keeps the search heading focusable without opening the soft keyboard automatically', () => {
  render(
    provider(
      <CurrencySearchPanel
        codes={['USD']}
        value="USD"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        autoFocusSearch={false}
      />
    )
  );
  expect(screen.getByRole('heading', { name: en.currencyPicker.title })).toHaveFocus();
  expect(screen.getByRole('combobox')).not.toHaveFocus();
});

it('a narrow-panel Search key does not select the first result, while deliberate arrow navigation can select', () => {
  const select = vi.fn();
  render(
    provider(
      <CurrencySearchPanel
        codes={['USD', 'JPY']}
        value="JPY"
        onSelect={select}
        onCancel={vi.fn()}
        autoFocusSearch={false}
        enterSelection="navigated"
      />
    )
  );
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'usd' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(select).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(select).toHaveBeenCalledExactlyOnceWith('USD');
  fireEvent.change(input, { target: { value: 'yen' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(select).toHaveBeenCalledOnce();
});

it('outside dismissal and Escape restore focus without selecting a currency', async () => {
  const select = vi.fn();
  const user = userEvent.setup();
  render(provider(<Harness onSelect={select} />));
  const trigger = screen.getByRole('button', { name: 'Currency field' });
  await user.click(trigger);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).toBeNull();
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  // DismissableLayer registers the outside pointer listener after opening.
  await new Promise((resolve) => setTimeout(resolve, 0));
  fireEvent.pointerDown(document.body, { pointerType: 'mouse', button: 0 });
  expect(screen.queryByRole('listbox')).toBeNull();
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(select).not.toHaveBeenCalled();
  expect(chosen()).toHaveTextContent('USD');
});

it('retains a removed value without a false checkmark, and permits explicitly choosing a remaining code', async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  const { rerender } = render(provider(<Harness codes={['TWD', 'USD']} onSelect={select} />));
  await user.click(screen.getByRole('button', { name: 'Currency field' }));
  rerender(provider(<Harness codes={['TWD']} onSelect={select} />));
  expect(chosen()).toHaveTextContent('USD');
  expect(option('TWD')).toHaveAttribute('aria-selected', 'false');
  await user.click(option('TWD'));
  expect(select).toHaveBeenCalledExactlyOnceWith('TWD');
});

it('disabled selection cannot write even if the panel was already open', async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  const { rerender } = render(provider(<Harness onSelect={select} />));
  await user.click(screen.getByRole('button', { name: 'Currency field' }));
  rerender(provider(<Harness onSelect={select} disabled />));
  expect(screen.getByRole('combobox')).toBeDisabled();
  fireEvent.click(option('JPY'));
  expect(select).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: en.common.cancel }));
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('has no fake selected row or default when there are no allowed candidates', () => {
  const select = vi.fn();
  render(
    provider(<CurrencySearchPanel codes={[]} value="USD" onSelect={select} onCancel={vi.fn()} />)
  );
  expect(screen.queryByRole('option')).toBeNull();
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
  expect(select).not.toHaveBeenCalled();
});

it('renders and selects a supplied non-common code even when Intl names are unavailable', () => {
  vi.spyOn(Intl, 'DisplayNames').mockImplementation(() => {
    throw new Error('No currency names');
  });
  const select = vi.fn();
  render(
    provider(
      <CurrencySearchPanel
        codes={['AED', 'USD']}
        value="USD"
        onSelect={select}
        onCancel={vi.fn()}
      />
    )
  );
  expect(screen.getByRole('option', { name: 'AED' })).toHaveTextContent(/^AED$/);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'aed' } });
  fireEvent.click(screen.getByRole('option', { name: 'AED' }));
  expect(select).toHaveBeenCalledExactlyOnceWith('AED');
});

describe.each(Object.entries(catalogs))('%s presentation', (locale, messages) => {
  it('uses the real catalog for code/localized/English search and accessible selected state', async () => {
    const user = userEvent.setup();
    render(provider(<Harness />, locale as keyof typeof catalogs));
    await user.click(screen.getByRole('button', { name: 'Currency field' }));
    expect(screen.getByRole('dialog', { name: messages.currencyPicker.title })).toBeVisible();
    expect(option('TWD')).toHaveTextContent(messages.currencyPicker.names.TWD);
    expect(option('USD')).toHaveTextContent(messages.currencyPicker.names.USD);
    expect(option('USD')).toHaveAttribute('aria-selected', 'true');
    await user.type(screen.getByRole('combobox'), messages.currencyPicker.names.USD);
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.clear(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'US Dollar');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await expectNoSeriousAxeViolations(document.body);
  });
});

it('the favourites adapter excludes existing codes, adds once, closes and never shows a fake selected favourite', async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  const { rerender } = render(
    provider(<CurrencyCombobox excluded={['TWD', 'JPY']} onSelect={select} />)
  );
  const trigger = screen.getByRole('button', { name: en.trip.currencySettings.addCurrency });
  await user.click(trigger);
  expect(screen.queryByRole('option', { name: /^TWD / })).toBeNull();
  expect(screen.queryByRole('option', { name: /^JPY / })).toBeNull();
  expect(
    screen.getAllByRole('option').every((row) => row.getAttribute('aria-selected') === 'false')
  ).toBe(true);
  await user.type(screen.getByRole('combobox'), 'usd');
  await user.click(option('USD'));
  expect(select).toHaveBeenCalledExactlyOnceWith('USD');
  expect(screen.queryByRole('listbox')).toBeNull();
  rerender(provider(<CurrencyCombobox excluded={['TWD', 'JPY', 'USD']} onSelect={select} />));
  await user.click(trigger);
  await user.type(screen.getByRole('combobox'), 'usd');
  expect(screen.queryByRole('option')).toBeNull();
  await user.click(screen.getByRole('button', { name: en.common.cancel }));
  expect(select).toHaveBeenCalledOnce();
});

it('the favourites adapter keeps its disabled trigger', () => {
  render(provider(<CurrencyCombobox excluded={[]} onSelect={vi.fn()} disabled />));
  expect(screen.getByRole('button', { name: en.trip.currencySettings.addCurrency })).toBeDisabled();
});
