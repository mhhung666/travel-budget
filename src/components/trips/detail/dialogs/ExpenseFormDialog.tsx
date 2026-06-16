'use client';

import { useState, useEffect } from 'react';
import { X, DollarSign, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CATEGORIES, DEFAULT_CATEGORY } from '@/constants/categories';
import type { Expense, Member } from '@/types';
import { cn } from '@/lib/utils';

// UI Components
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

export interface ExpenseDialogData {
    payer_id: string;
    original_amount: string;
    currency: string;
    exchange_rate: string;
    description: string;
    category: string;
    date: string;
    splits: { user_id: string; share_amount: number }[];
}

interface ExpenseFormDialogProps {
    mode: 'add' | 'edit';
    open: boolean;
    onClose: () => void;
    onSubmit: (data: ExpenseDialogData) => Promise<void>;
    members: Member[];
    currentUser: { id: string } | null;
    expense?: Expense | null; // Required for edit mode
}

export default function ExpenseFormDialog({
    mode,
    open,
    onClose,
    onSubmit,
    members,
    currentUser,
    expense,
}: ExpenseFormDialogProps) {
    const tExpense = useTranslations('expense');
    const tCommon = useTranslations('common');
    const t = useTranslations();

    const [error, setError] = useState('');
    const [form, setForm] = useState({
        payer_id: '' as string,
        original_amount: '',
        currency: 'TWD',
        exchange_rate: '1.0',
        description: '',
        category: DEFAULT_CATEGORY,
        date: new Date().toISOString().split('T')[0],
    });

    const [splitState, setSplitState] = useState<Record<string, { selected: boolean; manualAmount: string }>>({});
    const [showAdvanced, setShowAdvanced] = useState(mode === 'edit'); // Default expanded for edit

    // Exchange rate states
    const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
    const [loadingRates, setLoadingRates] = useState(false);
    const [ratesError, setRatesError] = useState('');

    // Fetch exchange rates
    const fetchExchangeRates = async () => {
        setLoadingRates(true);
        setRatesError('');
        try {
            const response = await fetch('/api/exchange-rates');
            const data = await response.json();

            if (data.success) {
                setExchangeRates(data.rates);
            } else {
                setRatesError('無法獲取匯率');
                if (data.rates) {
                    setExchangeRates(data.rates);
                }
            }
        } catch (err) {
            setRatesError('獲取匯率失敗');
        } finally {
            setLoadingRates(false);
        }
    };

    useEffect(() => {
        if (open) {
            if (mode === 'edit' && expense) {
                // Edit mode: Load existing expense data
                setForm({
                    payer_id: expense.payer_id,
                    original_amount: expense.original_amount.toString(),
                    currency: expense.currency,
                    exchange_rate: expense.exchange_rate.toString(),
                    description: expense.description,
                    category: expense.category || DEFAULT_CATEGORY,
                    date: new Date(expense.date).toISOString().split('T')[0],
                });

                // Initialize split state from existing splits
                const initialSplits: Record<string, { selected: boolean; manualAmount: string }> = {};
                const exchangeRate = parseFloat(expense.exchange_rate.toString());

                members.forEach(m => {
                    const existingSplit = expense.splits.find(s => s.user_id === m.id);
                    if (existingSplit) {
                        // Convert TWD back to original currency for display
                        const originalAmount = existingSplit.share_amount / exchangeRate;
                        initialSplits[m.id] = {
                            selected: true,
                            manualAmount: originalAmount.toFixed(expense.currency === 'JPY' ? 0 : 2)
                        };
                    } else {
                        initialSplits[m.id] = { selected: false, manualAmount: '' };
                    }
                });
                setSplitState(initialSplits);
            } else {
                // Add mode: Initialize with defaults
                setForm({
                    payer_id: currentUser?.id || members[0]?.id || '',
                    original_amount: '',
                    currency: 'TWD',
                    exchange_rate: '1.0',
                    description: '',
                    category: DEFAULT_CATEGORY,
                    date: new Date().toISOString().split('T')[0],
                });

                // Init splits: All selected, no manual amounts (equal split)
                const initialSplits: Record<string, { selected: boolean; manualAmount: string }> = {};
                members.forEach(m => {
                    initialSplits[m.id] = { selected: true, manualAmount: '' };
                });
                setSplitState(initialSplits);
            }

            setError('');
            setShowAdvanced(mode === 'edit');
            fetchExchangeRates();
        }
    }, [open, mode, expense, members, currentUser]);

    // Calculate Splits Logic (in original currency)
    const { calculatedSplitsOriginal, calculatedSplitsTWD, isValidSplit, splitWarning } = (() => {
        const originalAmount = parseFloat(form.original_amount) || 0;
        const exchangeRate = parseFloat(form.exchange_rate) || 1;
        const totalAmountTWD = originalAmount * exchangeRate;

        let manualSumOriginal = 0;
        let autoCheckCount = 0;
        const resultOriginal: Record<string, number> = {};
        const resultTWD: Record<string, number> = {};

        // 1. First pass: Sum manual amounts (in original currency) and count auto-selected
        members.forEach(m => {
            const state = splitState[m.id];
            if (!state?.selected) {
                resultOriginal[m.id] = 0;
                resultTWD[m.id] = 0;
                return;
            }

            if (state.manualAmount !== '') {
                const valOriginal = parseFloat(state.manualAmount) || 0;
                manualSumOriginal += valOriginal;
                resultOriginal[m.id] = valOriginal;
                resultTWD[m.id] = valOriginal * exchangeRate;
            } else {
                autoCheckCount++;
            }
        });

        // 2. Distribute remaining amount (in original currency)
        const remainingOriginal = Math.max(0, originalAmount - manualSumOriginal);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const manualSumTWD = manualSumOriginal * exchangeRate;

        // 3. Assign auto amounts (in original currency)
        if (autoCheckCount > 0) {
            const perPersonOriginal = remainingOriginal / autoCheckCount;
            const perPersonTWD = perPersonOriginal * exchangeRate;
            members.forEach(m => {
                const state = splitState[m.id];
                if (state?.selected && state.manualAmount === '') {
                    resultOriginal[m.id] = perPersonOriginal;
                    resultTWD[m.id] = perPersonTWD;
                }
            });
        }

        // Calculate total TWD splits for validation
        let totalSplitsTWD = 0;
        members.forEach(m => {
            if (splitState[m.id]?.selected) {
                totalSplitsTWD += resultTWD[m.id] || 0;
            }
        });

        // Warning if manual exceeds total or splits don't match (with tolerance for floating point errors)
        let warning = '';
        const tolerance = Math.max(1, totalAmountTWD * 0.0001); // 0.01% tolerance or 1 TWD minimum

        if (totalSplitsTWD > totalAmountTWD + tolerance) {
            warning = tCommon('error.splitExceedsTotal');
        } else if (Math.abs(totalSplitsTWD - totalAmountTWD) > tolerance) {
            warning = tCommon('error.splitNotFullyAllocated');
        }

        return {
            calculatedSplitsOriginal: resultOriginal,
            calculatedSplitsTWD: resultTWD,
            isValidSplit: !warning,
            splitWarning: warning
        };
    })();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!isValidSplit) {
            setError(splitWarning);
            return;
        }

        try {
            // Construct splits array (using TWD amounts for storage)
            const finalSplits = members
                .filter(m => splitState[m.id]?.selected)
                .map(m => ({
                    user_id: m.id,
                    share_amount: calculatedSplitsTWD[m.id] // Use the calculated TWD amount
                }));

            if (finalSplits.length === 0) {
                setError(tExpense('error.noMembersSelected'));
                return;
            }

            await onSubmit({
                ...form,
                splits: finalSplits
            });
            // Parent handles close
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError(tCommon('error.unknown'));
            }
        }
    };

    const handleSplitToggle = (userId: string) => {
        setSplitState(prev => ({
            ...prev,
            [userId]: {
                ...prev[userId],
                selected: !prev[userId]?.selected,
                manualAmount: '' // Reset manual if toggled
            }
        }));
    };

    const handleManualAmountChange = (userId: string, value: string) => {
        setSplitState(prev => ({
            ...prev,
            [userId]: {
                ...prev[userId],
                selected: true,
                manualAmount: value
            }
        }));
    };

    const handleSelectAll = () => {
        const allSelected = members.every(m => splitState[m.id]?.selected);
        const newState: Record<string, { selected: boolean; manualAmount: string }> = {};
        members.forEach(m => {
            newState[m.id] = {
                selected: !allSelected,
                manualAmount: ''
            };
        });
        setSplitState(newState);
    };

    const handleCategorySelect = (categoryCode: string) => {
        setForm(prev => ({ ...prev, category: categoryCode }));
    };

    const currencies = [
        { code: 'TWD', label: 'TWD' },
        { code: 'JPY', label: 'JPY' },
        { code: 'USD', label: 'USD' },
        { code: 'EUR', label: 'EUR' },
        { code: 'HKD', label: 'HKD' },
    ];

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'add' ? tExpense('add') : tExpense('edit')}
                    </DialogTitle>
                    <DialogDescription className="hidden">
                        Expense Form
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Amount & Currency - Hero Section */}
                    <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-xl border">
                        <Input
                            placeholder="0"
                            value={form.original_amount}
                            onChange={(e) => setForm({ ...form, original_amount: e.target.value })}
                            required
                            type="number"
                            className="border-none shadow-none text-4xl font-bold h-16 bg-transparent focus-visible:ring-0 px-0"
                            autoFocus
                        />
                        <Select
                            value={form.currency}
                            onValueChange={(value) => {
                                const rate = value === 'TWD' ? '1.0' : (exchangeRates[value]?.toFixed(6) || form.exchange_rate);
                                setForm({
                                    ...form,
                                    currency: value,
                                    exchange_rate: rate,
                                });
                            }}
                        >
                            <SelectTrigger className="w-[100px] border-none bg-transparent text-lg font-medium focus:ring-0">
                                <SelectValue placeholder="Currency" />
                            </SelectTrigger>
                            <SelectContent>
                                {currencies.map((c) => (
                                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Description */}
                    <Input
                        placeholder={tExpense('form.descriptionPlaceholder')}
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        required
                    />

                    {/* Category - Grid */}
                    <div>
                        <Label className="text-muted-foreground mb-2 block text-xs font-semibold uppercase tracking-wider">
                            {tExpense('form.category')}
                        </Label>
                        <div className="grid grid-cols-4 gap-2">
                            {CATEGORIES.map((cat) => {
                                const isSelected = form.category === cat.code;
                                return (
                                    <div
                                        key={cat.code}
                                        onClick={() => handleCategorySelect(cat.code)}
                                        className={cn(
                                            "flex flex-col items-center justify-center p-2 rounded-lg cursor-pointer transition-all border",
                                            isSelected
                                                ? "bg-primary/10 border-primary text-primary"
                                                : "bg-transparent border-transparent hover:bg-muted text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <span className="text-2xl mb-1">{cat.icon}</span>
                                        <span className={cn("text-xs truncate w-full text-center", isSelected && "font-semibold")}>
                                            {t(cat.nameKey)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Split Members */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                                {tExpense('form.splitWith')}
                            </Label>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleSelectAll}
                                className="h-6 text-xs px-2"
                            >
                                {tCommon('toggleAll')}
                            </Button>
                        </div>

                        <div className="space-y-2">
                            {members.map((member) => {
                                const state = splitState[member.id] || { selected: false, manualAmount: '' };
                                const amountOriginal = calculatedSplitsOriginal[member.id] || 0;
                                const isManual = state.manualAmount !== '';

                                return (
                                    <div
                                        key={member.id}
                                        className={cn(
                                            "flex items-center justify-between p-2 rounded-lg border transition-all",
                                            state.selected
                                                ? "bg-primary/5 border-primary/20"
                                                : "bg-transparent border-border opacity-60"
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                checked={state.selected}
                                                onCheckedChange={() => handleSplitToggle(member.id)}
                                                id={`split-${member.id}`}
                                            />
                                            <Label
                                                htmlFor={`split-${member.id}`}
                                                className="cursor-pointer font-medium"
                                            >
                                                {member.display_name}
                                            </Label>
                                        </div>

                                        {state.selected ? (
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground w-8 text-right">
                                                    {form.currency}
                                                </span>
                                                <Input
                                                    // variant="ghost" removed
                                                    placeholder={amountOriginal.toFixed(form.currency === 'JPY' ? 0 : 2)}
                                                    value={state.manualAmount}
                                                    onChange={(e) => handleManualAmountChange(member.id, e.target.value)}
                                                    type="number"
                                                    className={cn(
                                                        "h-8 w-24 text-right pr-2 border-none shadow-none focus-visible:ring-0",
                                                        isManual ? "font-bold text-primary bg-background shadow-sm" : "bg-transparent"
                                                    )}
                                                />
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground pr-2">--</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {splitWarning && (
                            <Alert className="bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-900">
                                <DollarSign className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                                <AlertTitle className="text-yellow-800 dark:text-yellow-300">Warning</AlertTitle>
                                <AlertDescription className="text-yellow-700 dark:text-yellow-400">
                                    {splitWarning}
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>

                    {/* Advanced Options Toggle */}
                    <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-start text-muted-foreground h-9 font-normal"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                        {showAdvanced ? tCommon('hideDetails') : tCommon('moreDetails')}
                    </Button>

                    {/* Advanced Options Content */}
                    {showAdvanced && (
                        <div className="space-y-4 p-4 bg-muted/30 rounded-lg animate-in fade-in slide-in-from-top-2">
                            <div className="space-y-2">
                                <Label>{tExpense('form.payer')}</Label>
                                <Select
                                    value={form.payer_id.toString()}
                                    onValueChange={(val) => setForm({ ...form, payer_id: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Payer" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {members.map((member) => (
                                            <SelectItem key={member.id} value={member.id.toString()}>
                                                {member.display_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>{tExpense('form.date')}</Label>
                                <Input
                                    type="date"
                                    value={form.date}
                                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                                />
                            </div>

                            {form.currency !== 'TWD' && (
                                <div className="space-y-2">
                                    <Label>{tExpense('form.exchangeRate')}</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="number"
                                            value={form.exchange_rate}
                                            onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })}
                                            step="0.000001"
                                        />
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={fetchExchangeRates}
                                                        disabled={loadingRates}
                                                        className="shrink-0"
                                                    >
                                                        {loadingRates ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <RefreshCw className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Refresh Exchange Rate</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        1 {form.currency} = {parseFloat(form.exchange_rate).toFixed(4)} TWD
                                    </p>
                                    {ratesError && (
                                        <p className="text-xs text-destructive">{ratesError}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button type="button" variant="outline" onClick={onClose}>
                            {tCommon('cancel')}
                        </Button>
                        <Button
                            type="submit"
                            disabled={!isValidSplit || !form.original_amount}
                        >
                            {mode === 'add' ? tExpense('add') : tCommon('save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
