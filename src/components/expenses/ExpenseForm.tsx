'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { CURRENCIES, formatCurrency } from '@/constants/currencies';
import { CATEGORIES, DEFAULT_CATEGORY } from '@/constants/categories';
import type { Member, Expense, CreateExpenseDto, UpdateExpenseDto } from '@/types';

export interface ExpenseFormData {
  payer_id: number;
  original_amount: string;
  currency: string;
  exchange_rate: string;
  description: string;
  category: string;
  date: string;
  split_with: number[];
}

export interface ExpenseFormProps {
  open: boolean;
  mode: 'create' | 'edit';
  members: Member[];
  currentUserId?: number;
  initialData?: Partial<ExpenseFormData>;
  editingExpense?: Expense | null;
  loading?: boolean;
  error?: string | null;
  onSubmit: (data: CreateExpenseDto | UpdateExpenseDto) => Promise<void>;
  onClose: () => void;
}

const defaultFormData: ExpenseFormData = {
  payer_id: 0,
  original_amount: '',
  currency: 'TWD',
  exchange_rate: '1.0',
  description: '',
  category: DEFAULT_CATEGORY,
  date: new Date().toISOString().split('T')[0],
  split_with: [],
};

export function ExpenseForm({
  open,
  mode,
  members,
  currentUserId,
  initialData,
  editingExpense,
  loading = false,
  error,
  onSubmit,
  onClose,
}: ExpenseFormProps) {
  const [form, setForm] = useState<ExpenseFormData>(() => ({
    ...defaultFormData,
    payer_id: currentUserId || 0,
    ...initialData,
  }));

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && editingExpense) {
        setForm({
          payer_id: editingExpense.payer_id,
          original_amount: editingExpense.original_amount.toString(),
          currency: editingExpense.currency,
          exchange_rate: editingExpense.exchange_rate.toString(),
          description: editingExpense.description,
          category: editingExpense.category || DEFAULT_CATEGORY,
          date: editingExpense.date,
          split_with: editingExpense.splits.map((s) => s.user_id),
        });
      } else {
        setForm({
          ...defaultFormData,
          payer_id: currentUserId || 0,
          ...initialData,
        });
      }
    }
  }, [open, mode, editingExpense, currentUserId, initialData]);

  const handleChange =
    (field: keyof ExpenseFormData) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
      };

  const handleSelectChange = (field: keyof ExpenseFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePayerChange = (value: string) => {
    setForm((prev) => ({ ...prev, payer_id: Number(value) }));
  };

  const toggleSplitMember = (userId: number) => {
    setForm((prev) => ({
      ...prev,
      split_with: prev.split_with.includes(userId)
        ? prev.split_with.filter((id) => id !== userId)
        : [...prev.split_with, userId],
    }));
  };

  const selectAllMembers = () => {
    setForm((prev) => ({
      ...prev,
      split_with: members.map((m) => m.id),
    }));
  };

  const calculateConvertedAmount = () => {
    const amount = parseFloat(form.original_amount) || 0;
    const rate = parseFloat(form.exchange_rate) || 1;
    return amount * rate;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'create') {
      const data: CreateExpenseDto = {
        payer_id: form.payer_id,
        original_amount: parseFloat(form.original_amount),
        currency: form.currency,
        exchange_rate: parseFloat(form.exchange_rate),
        description: form.description.trim(),
        category: form.category,
        date: form.date,
        split_with: form.split_with,
      };
      await onSubmit(data);
    } else {
      const data: UpdateExpenseDto = {
        original_amount: parseFloat(form.original_amount),
        currency: form.currency,
        exchange_rate: parseFloat(form.exchange_rate),
        description: form.description.trim(),
        category: form.category,
      };
      await onSubmit(data);
    }
  };

  const isValid =
    form.description.trim() &&
    parseFloat(form.original_amount) > 0 &&
    (mode === 'edit' || (form.payer_id > 0 && form.split_with.length > 0));

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !loading && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add Expense' : 'Edit Expense'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            {mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="payer">Payer</Label>
                <Select
                  value={form.payer_id.toString()}
                  onValueChange={handlePayerChange}
                  disabled={loading}
                >
                  <SelectTrigger id="payer">
                    <SelectValue placeholder="Select payer" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id.toString()}>
                        {member.display_name || member.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={handleChange('description')}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(val) => handleSelectChange('category', val)}
                disabled={loading}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="flex items-center gap-2">
                        <span>{c.icon}</span>
                        <span>{c.code.charAt(0).toUpperCase() + c.code.slice(1)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  value={form.original_amount}
                  onChange={handleChange('original_amount')}
                  required
                  disabled={loading}
                  step="0.01"
                  min="0"
                />
              </div>
              <div className="w-[120px] space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(val) => handleSelectChange('currency', val)}
                  disabled={loading}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.symbol} {c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.currency !== 'TWD' && (
              <div className="space-y-2">
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="exchange_rate">Exchange Rate (to TWD)</Label>
                    <Input
                      id="exchange_rate"
                      type="number"
                      value={form.exchange_rate}
                      onChange={handleChange('exchange_rate')}
                      disabled={loading}
                      step="0.0001"
                      min="0"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  = {formatCurrency(calculateConvertedAmount(), 'TWD')}
                </p>
              </div>
            )}

            {mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={handleChange('date')}
                  required
                  disabled={loading}
                />
              </div>
            )}

            {mode === 'create' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Split with:</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllMembers}
                    disabled={loading}
                    className="h-8 text-xs"
                  >
                    Select All
                  </Button>
                </div>
                <div className="flex flex-wrap gap-3">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`split-${member.id}`}
                        checked={form.split_with.includes(member.id)}
                        onCheckedChange={() => toggleSplitMember(member.id)}
                        disabled={loading}
                      />
                      <Label
                        htmlFor={`split-${member.id}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {member.display_name || member.username}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !isValid}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
