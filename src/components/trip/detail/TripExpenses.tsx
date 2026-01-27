import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    Chip,
    IconButton,
    Collapse,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Divider,
} from '@mui/material';
import { ExpandMore, ExpandLess, Add, Edit, Delete } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { getCategoryIcon } from '@/constants/categories';
import type { Expense, Member } from '@/types';

interface TripExpensesProps {
    expenses: Expense[];
    members: Member[];
    isCurrentUserMember: boolean;
    filterMemberId: number | 'all';
    onFilterChange: (id: number | 'all') => void;
    onAdd: (e: React.MouseEvent) => void;
    onEdit: (expense: Expense) => void;
    onDelete: (id: number) => void;
    expanded: boolean;
    onToggleExpand: () => void;
}

export default function TripExpenses({
    expenses,
    members,
    isCurrentUserMember,
    filterMemberId,
    onFilterChange,
    onAdd,
    onEdit,
    onDelete,
    expanded,
    onToggleExpand,
}: TripExpensesProps) {
    const tExpense = useTranslations('expense');
    const tCommon = useTranslations('common');

    return (
        <Card elevation={2}>
            <CardContent>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        mb: expanded ? 2 : 0,
                    }}
                    onClick={onToggleExpand}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h6" fontWeight={600}>
                            {tExpense('title')}
                        </Typography>
                        <Chip label={expenses.length} size="small" color="primary" />
                    </Box>
                    <IconButton size="small">
                        {expanded ? <ExpandLess /> : <ExpandMore />}
                    </IconButton>
                </Box>

                <Collapse in={expanded}>
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            mb: 2,
                            flexWrap: 'wrap',
                            gap: 2,
                        }}
                    >
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                            <InputLabel>{tExpense('filter')}</InputLabel>
                            <Select
                                value={filterMemberId}
                                onChange={(e) => onFilterChange(e.target.value as number | 'all')}
                                label={tExpense('filter')}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <MenuItem value="all">{tExpense('filterAll')}</MenuItem>
                                {members.map((member) => (
                                    <MenuItem key={member.id} value={member.id}>
                                        {member.display_name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {isCurrentUserMember && (
                            <Button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAdd(e);
                                }}
                                variant="contained"
                                startIcon={<Add />}
                            >
                                {tExpense('add')}
                            </Button>
                        )}
                    </Box>

                    {(() => {
                        const filteredExpenses =
                            filterMemberId === 'all'
                                ? expenses
                                : expenses.filter((expense) =>
                                    expense.splits.some((split) => split.user_id === filterMemberId)
                                );

                        if (expenses.length === 0) {
                            return (
                                <Box sx={{ textAlign: 'center', py: 8 }}>
                                    <Typography variant="body1" color="text.secondary" gutterBottom>
                                        {tExpense('noExpenses')}
                                    </Typography>
                                    {isCurrentUserMember && (
                                        <Typography variant="body2" color="text.secondary">
                                            {tExpense('clickToAdd')}
                                        </Typography>
                                    )}
                                </Box>
                            );
                        }

                        if (filteredExpenses.length === 0) {
                            return (
                                <Box sx={{ textAlign: 'center', py: 8 }}>
                                    <Typography variant="body1" color="text.secondary" gutterBottom>
                                        {tExpense('noFilterResults')}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {tExpense('noFilterResultsHint')}
                                    </Typography>
                                </Box>
                            );
                        }

                        return (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {filteredExpenses.map((expense) => (
                                    <Card
                                        key={expense.id}
                                        elevation={0}
                                        sx={{
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            transition: 'all 0.3s',
                                            '&:hover': { boxShadow: 2 },
                                        }}
                                    >
                                        <CardContent>
                                            <Box
                                                sx={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'flex-start',
                                                    mb: 1,
                                                }}
                                            >
                                                <Box sx={{ flex: 1 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <Typography variant="subtitle1" fontWeight={600}>
                                                            {getCategoryIcon(expense.category)} {expense.description}
                                                        </Typography>
                                                    </Box>
                                                    <Typography variant="body2" color="text.secondary">
                                                        {expense.payer_name} {tExpense('paidBy')} •{' '}
                                                        {new Date(expense.date).toLocaleDateString()}
                                                    </Typography>
                                                </Box>
                                                <Box sx={{ textAlign: 'right' }}>
                                                    {expense.currency !== 'TWD' ? (
                                                        <>
                                                            <Typography variant="body2" color="text.secondary">
                                                                {expense.original_amount.toLocaleString()}{' '}
                                                                {expense.currency} ({tExpense('rate')} {expense.exchange_rate})
                                                            </Typography>
                                                            <Typography variant="h6" color="primary" fontWeight={700}>
                                                                = NT${expense.amount.toLocaleString()}
                                                            </Typography>
                                                        </>
                                                    ) : (
                                                        <Typography variant="h6" color="primary" fontWeight={700}>
                                                            NT${expense.amount.toLocaleString()}
                                                        </Typography>
                                                    )}
                                                    {isCurrentUserMember && (
                                                        <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                                                            <Button
                                                                onClick={() => onEdit(expense)}
                                                                size="small"
                                                                startIcon={<Edit />}
                                                            >
                                                                {tCommon('edit')}
                                                            </Button>
                                                            <Button
                                                                onClick={() => onDelete(expense.id)}
                                                                size="small"
                                                                color="error"
                                                                startIcon={<Delete />}
                                                            >
                                                                {tCommon('delete')}
                                                            </Button>
                                                        </Box>
                                                    )}
                                                </Box>
                                            </Box>
                                            <Divider sx={{ my: 1.5 }} />
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                display="block"
                                                sx={{ mb: 1 }}
                                            >
                                                {tExpense('splitMembers')}
                                            </Typography>
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                                {expense.splits.map((split) => (
                                                    <Chip
                                                        key={split.user_id}
                                                        label={`${split.display_name}: $${split.share_amount.toFixed(0)}`}
                                                        size="small"
                                                        variant="outlined"
                                                    />
                                                ))}
                                            </Box>
                                        </CardContent>
                                    </Card>
                                ))}
                            </Box>
                        );
                    })()}
                </Collapse>
            </CardContent>
        </Card>
    );
}
