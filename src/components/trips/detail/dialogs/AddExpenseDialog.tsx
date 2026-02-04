import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Box,
    IconButton,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    Typography,
    FormControlLabel,
    Checkbox,
    Button,
    CircularProgress,
    Tooltip
} from '@mui/material';
import { X, DollarSign, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CATEGORIES, DEFAULT_CATEGORY } from '@/constants/categories';
import type { Member } from '@/types';

interface AddExpenseDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<void>;
    members: Member[];
    currentUser: any;
}

export default function AddExpenseDialog({
    open,
    onClose,
    onSubmit,
    members,
    currentUser,
}: AddExpenseDialogProps) {
    const tExpense = useTranslations('expense');
    const tCommon = useTranslations('common');
    const tCurrency = useTranslations('currency');
    const t = useTranslations(); // for categories

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 600;

    const [error, setError] = useState('');
    const [form, setForm] = useState({
        payer_id: 0,
        original_amount: '',
        currency: 'TWD',
        exchange_rate: '1.0',
        description: '',
        category: DEFAULT_CATEGORY,
        date: new Date().toISOString().split('T')[0],
    });

    const [splitState, setSplitState] = useState<Record<number, { selected: boolean; manualAmount: string }>>({});
    const [showAdvanced, setShowAdvanced] = useState(false);

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
                // Use fallback rates
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
            setForm({
                payer_id: currentUser?.id || members[0]?.id || 0,
                original_amount: '',
                currency: 'TWD',
                exchange_rate: '1.0',
                description: '',
                category: DEFAULT_CATEGORY,
                date: new Date().toISOString().split('T')[0],
            });

            // Init splits: All selected, no manual amounts (equal split)
            const initialSplits: Record<number, { selected: boolean; manualAmount: string }> = {};
            members.forEach(m => {
                initialSplits[m.id] = { selected: true, manualAmount: '' };
            });
            setSplitState(initialSplits);

            setError('');
            setShowAdvanced(false);

            // Fetch exchange rates when dialog opens
            fetchExchangeRates();
        }
    }, [open, currentUser, members]);

    // Calculate Splits Logic
    const { calculatedSplits, isValidSplit, splitWarning } = (() => {
        const totalAmount = (parseFloat(form.original_amount) || 0) * (parseFloat(form.exchange_rate) || 1);

        let manualSum = 0;
        let autoCheckCount = 0;
        const result: Record<number, number> = {};

        // 1. First pass: Sum manual amounts and count auto-selected
        members.forEach(m => {
            const state = splitState[m.id];
            if (!state?.selected) {
                result[m.id] = 0;
                return;
            }

            if (state.manualAmount !== '') {
                const val = parseFloat(state.manualAmount) || 0;
                manualSum += val;
                result[m.id] = val;
            } else {
                autoCheckCount++;
            }
        });

        // 2. Distribute remaining amount
        const remaining = Math.max(0, totalAmount - manualSum);
        // Warning if manual exceeds total or no one to split remaining
        let warning = '';
        if (manualSum > totalAmount + 0.5) warning = tCommon('error.splitExceedsTotal'); // Tolerance 0.5
        if (remaining > 0.5 && autoCheckCount === 0) warning = tCommon('error.splitNotFullyAllocated');

        // 3. Assign auto amounts
        if (autoCheckCount > 0) {
            const perPerson = remaining / autoCheckCount;
            members.forEach(m => {
                const state = splitState[m.id];
                if (state?.selected && state.manualAmount === '') {
                    result[m.id] = perPerson;
                }
            });
        }

        return {
            calculatedSplits: result,
            isValidSplit: !warning, // Strict check? maybe soft check
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
            // Construct splits array
            const finalSplits = members
                .filter(m => splitState[m.id]?.selected)
                .map(m => ({
                    user_id: m.id,
                    share_amount: calculatedSplits[m.id] // Use the calculated (TWD) amount
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

    const handleSplitToggle = (userId: number) => {
        setSplitState(prev => ({
            ...prev,
            [userId]: {
                ...prev[userId],
                selected: !prev[userId]?.selected,
                manualAmount: '' // Reset manual if toggled? Optional logic.
            }
        }));
    };

    const handleManualAmountChange = (userId: number, value: string) => {
        setSplitState(prev => ({
            ...prev,
            [userId]: {
                ...prev[userId],
                selected: true, // Auto select if typing
                manualAmount: value
            }
        }));
    };

    const handleSelectAll = () => {
        const allSelected = members.every(m => splitState[m.id]?.selected);
        const newState: Record<number, any> = {};
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
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 3,
                    maxHeight: '90vh'
                }
            }}
        >
            <DialogTitle sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="h6" fontWeight={700}>
                        {tExpense('add')}
                    </Typography>
                    <IconButton onClick={onClose} size="small" sx={{ bgcolor: 'action.hover' }}>
                        <X size={20} />
                    </IconButton>
                </Box>
            </DialogTitle>

            <form onSubmit={handleSubmit}>
                <DialogContent sx={{ pt: 1, pb: 2 }}>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                            {error}
                        </Alert>
                    )}

                    {/* Amount & Currency - Hero Section */}
                    <Box sx={{
                        p: 2,
                        mb: 3,
                        bgcolor: 'background.default',
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: 'divider',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                    }}>
                        <TextField
                            fullWidth
                            variant="standard"
                            placeholder="0"
                            value={form.original_amount}
                            onChange={(e) => setForm({ ...form, original_amount: e.target.value })}
                            required
                            type="number"
                            InputProps={{
                                disableUnderline: true,
                                style: { fontSize: '2.5rem', fontWeight: 600 }
                            }}
                            autoFocus
                        />
                        <Select
                            value={form.currency}
                            onChange={(e) => {
                                const currency = e.target.value;
                                const rate = currency === 'TWD' ? '1.0' : (exchangeRates[currency]?.toFixed(6) || form.exchange_rate);
                                setForm({
                                    ...form,
                                    currency,
                                    exchange_rate: rate,
                                });
                            }}
                            variant="standard"
                            disableUnderline
                            sx={{
                                fontSize: '1.25rem',
                                fontWeight: 500,
                                '& .MuiSelect-select': { py: 0 }
                            }}
                        >
                            {currencies.map((c) => (
                                <MenuItem key={c.code} value={c.code}>{c.label}</MenuItem>
                            ))}
                        </Select>
                    </Box>

                    {/* Description - Quick Input */}
                    <TextField
                        fullWidth
                        placeholder={tExpense('form.descriptionPlaceholder')}
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        required
                        variant="outlined"
                        sx={{ mb: 3 }}
                        InputProps={{
                            sx: { borderRadius: 2 }
                        }}
                    />

                    {/* Category - Visual Grid */}
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 600 }}>
                        {tExpense('form.category')}
                    </Typography>
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 1,
                        mb: 3,
                        overflowX: 'auto',
                        pb: 1
                    }}>
                        {CATEGORIES.map((cat) => {
                            const isSelected = form.category === cat.code;
                            return (
                                <Box
                                    key={cat.code}
                                    onClick={() => handleCategorySelect(cat.code)}
                                    sx={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        p: 1,
                                        borderRadius: 2,
                                        cursor: 'pointer',
                                        bgcolor: isSelected ? 'primary.soft' : 'transparent',
                                        border: '1px solid',
                                        borderColor: isSelected ? 'primary.main' : 'transparent',
                                        color: isSelected ? 'primary.main' : 'text.secondary',
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                            bgcolor: isSelected ? 'primary.soft' : 'action.hover'
                                        }
                                    }}
                                >
                                    <Box sx={{ fontSize: '1.5rem', mb: 0.5 }}>{cat.icon}</Box>
                                    <Typography variant="caption" noWrap sx={{ maxWidth: '100%', fontWeight: isSelected ? 600 : 400 }}>
                                        {t(cat.nameKey)}
                                    </Typography>
                                </Box>
                            );
                        })}
                    </Box>

                    {/* Split Members - List View */}
                    <Box sx={{ mb: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                {tExpense('form.splitWith')}
                            </Typography>
                            <Button
                                size="small"
                                onClick={handleSelectAll}
                                sx={{ fontSize: '0.75rem', textTransform: 'none', py: 0 }}
                            >
                                {tCommon('toggleAll')}
                            </Button>
                        </Box>

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {members.map((member) => {
                                const state = splitState[member.id] || { selected: false, manualAmount: '' };
                                const amount = calculatedSplits[member.id] || 0;
                                const isManual = state.manualAmount !== '';

                                return (
                                    <Box
                                        key={member.id}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            p: 1,
                                            borderRadius: 2,
                                            bgcolor: state.selected ? 'primary.soft' : 'transparent',
                                            border: '1px solid',
                                            borderColor: state.selected ? 'primary.main' : 'divider',
                                            opacity: state.selected ? 1 : 0.6
                                        }}
                                    >
                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={state.selected}
                                                    onChange={() => handleSplitToggle(member.id)}
                                                    size="small"
                                                    sx={{ py: 0 }}
                                                />
                                            }
                                            label={
                                                <Typography variant="body2" fontWeight={500}>
                                                    {member.display_name}
                                                </Typography>
                                            }
                                            sx={{ m: 0, mr: 2 }}
                                        />

                                        {state.selected ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                {/* <Typography variant="caption" color="text.secondary">TWD</Typography> */}
                                                <TextField
                                                    variant="standard"
                                                    placeholder={amount.toFixed(0)}
                                                    value={state.manualAmount}
                                                    onChange={(e) => handleManualAmountChange(member.id, e.target.value)}
                                                    type="number"
                                                    InputProps={{
                                                        disableUnderline: true,
                                                        sx: {
                                                            fontSize: '0.9rem',
                                                            fontWeight: isManual ? 700 : 400,
                                                            color: isManual ? 'primary.main' : 'text.primary',
                                                            textAlign: 'right',
                                                            width: '80px',
                                                            bgcolor: 'background.paper',
                                                            borderRadius: 1,
                                                            px: 1
                                                        },
                                                        inputProps: {
                                                            style: { textAlign: 'right' }
                                                        }
                                                    }}
                                                />
                                            </Box>
                                        ) : (
                                            <Typography variant="caption" color="text.secondary">--</Typography>
                                        )}
                                    </Box>
                                );
                            })}
                        </Box>

                        {splitWarning && (
                            <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }} icon={<DollarSign size={16} />}>
                                {splitWarning}
                            </Alert>
                        )}
                    </Box>

                    {/* Advanced Options (Toggle) */}
                    <Button
                        fullWidth
                        variant="text"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        sx={{
                            justifyContent: 'flex-start',
                            color: 'text.secondary',
                            textTransform: 'none',
                            mb: 1
                        }}
                    >
                        {showAdvanced ? tCommon('hideDetails') : tCommon('moreDetails')}
                    </Button>

                    {showAdvanced && (
                        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, animation: 'fadeIn 0.3s' }}>
                            <FormControl fullWidth sx={{ mb: 2 }}>
                                <InputLabel>{tExpense('form.payer')}</InputLabel>
                                <Select
                                    value={form.payer_id}
                                    onChange={(e) => setForm({ ...form, payer_id: Number(e.target.value) })}
                                    label={tExpense('form.payer')}
                                    size="small"
                                >
                                    {members.map((member) => (
                                        <MenuItem key={member.id} value={member.id}>
                                            {member.display_name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <TextField
                                fullWidth
                                type="date"
                                label={tExpense('form.date')}
                                value={form.date}
                                onChange={(e) => setForm({ ...form, date: e.target.value })}
                                size="small"
                                sx={{ mb: 2 }}
                                InputLabelProps={{ shrink: true }}
                            />

                            {form.currency !== 'TWD' && (
                                <Box>
                                    <TextField
                                        fullWidth
                                        type="number"
                                        label={tExpense('form.exchangeRate')}
                                        value={form.exchange_rate}
                                        onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })}
                                        size="small"
                                        inputProps={{ step: '0.000001' }}
                                        helperText={`1 ${form.currency} = ${form.exchange_rate} TWD`}
                                        InputProps={{
                                            endAdornment: (
                                                <Tooltip title="重新獲取匯率">
                                                    <IconButton
                                                        size="small"
                                                        onClick={fetchExchangeRates}
                                                        disabled={loadingRates}
                                                        sx={{ mr: -1 }}
                                                    >
                                                        {loadingRates ? (
                                                            <CircularProgress size={16} />
                                                        ) : (
                                                            <RefreshCw size={16} />
                                                        )}
                                                    </IconButton>
                                                </Tooltip>
                                            )
                                        }}
                                    />
                                    {exchangeRates[form.currency] && (
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                            參考匯率: 1 {form.currency} ≈ {exchangeRates[form.currency].toFixed(4)} TWD
                                        </Typography>
                                    )}
                                    {ratesError && (
                                        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                                            {ratesError}（使用預設值）
                                        </Typography>
                                    )}
                                </Box>
                            )}
                        </Box>
                    )}

                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, pt: 0 }}>
                    <Button onClick={onClose} sx={{ color: 'text.secondary', borderRadius: 2 }}>
                        {tCommon('cancel')}
                    </Button>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={!isValidSplit || !form.original_amount}
                        sx={{
                            px: 4,
                            borderRadius: 2,
                            fontWeight: 600,
                            boxShadow: 'none',
                            '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }
                        }}
                    >
                        {tExpense('add')}
                    </Button>
                </DialogActions>
            </form>
            <style jsx global>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </Dialog>
    );
}
