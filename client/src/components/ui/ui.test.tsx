import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import Button from './Button';
import ToggleSwitch from './ToggleSwitch';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './Dialog';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from './Sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger } from './AlertDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select';

describe('Button', () => {
  it('supports loading and disabled states', () => {
    render(<Button loading>Запустить</Button>);
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('accessible overlays', () => {
  it('closes Dialog with Escape and restores focus', async () => {
    const user = userEvent.setup();
    render(<Dialog><DialogTrigger>Открыть</DialogTrigger><DialogContent><DialogTitle>Настройки</DialogTitle><DialogDescription>Описание</DialogDescription><button>Действие</button></DialogContent></Dialog>);
    const trigger = screen.getByRole('button', { name: 'Открыть' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Настройки' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('renders alert confirmation and cancellation', async () => {
    const user = userEvent.setup();
    render(<AlertDialog><AlertDialogTrigger>Удалить</AlertDialogTrigger><AlertDialogContent><AlertDialogTitle>Подтвердите</AlertDialogTitle><AlertDialogDescription>Необратимое действие</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction>Продолжить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>);
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Подтвердите');
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('opens a keyboard-accessible Sheet', async () => {
    const user = userEvent.setup();
    render(<Sheet><SheetTrigger>Меню</SheetTrigger><SheetContent><SheetTitle>Управление</SheetTitle></SheetContent></Sheet>);
    await user.click(screen.getByRole('button', { name: 'Меню' }));
    expect(screen.getByRole('dialog', { name: 'Управление' })).toBeVisible();
  });
});

describe('ToggleSwitch', () => {
  function ControlledSwitch() { const [checked, setChecked] = useState(false); return <ToggleSwitch checked={checked} onChange={setChecked} ariaLabel="Готовность" />; }
  it('toggles from keyboard', async () => {
    const user = userEvent.setup();
    render(<ControlledSwitch />);
    const control = screen.getByRole('switch', { name: 'Готовность' });
    control.focus();
    await user.keyboard(' ');
    expect(control).toBeChecked();
  });
});

describe('Select', () => {
  function ControlledSelect() {
    const [value, setValue] = useState('auto');
    return <Select value={value} onValueChange={setValue}><SelectTrigger aria-label="Режим"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Авто</SelectItem><SelectItem value="manual">Вручную</SelectItem></SelectContent></Select>;
  }

  it('selects an option with the keyboard', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect />);
    const trigger = screen.getByRole('combobox', { name: 'Режим' });
    trigger.focus();
    await user.keyboard('{Enter}{ArrowDown}{Enter}');
    expect(trigger).toHaveTextContent('Вручную');
  });
});
