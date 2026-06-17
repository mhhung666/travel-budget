'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, ArrowDown, Lightbulb } from 'lucide-react';
import type { Transaction } from '@/types';

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';

interface SettlementPlanProps {
    transactions: Transaction[];
    exchangeRates: Record<string, number>;
    loadingRates: boolean;
}

export default function SettlementPlan({
    transactions,
    exchangeRates,
    loadingRates,
}: SettlementPlanProps) {
    const t = useTranslations('settlement');
    const [selectedCurrency, setSelectedCurrency] = useState('TWD');

    const convertAmount = (amount: number): number => {
        if (selectedCurrency === 'TWD') return amount;
        const rate = exchangeRates[selectedCurrency];
        return rate ? amount / rate : amount;
    };

    const formatAmount = (amount: number): string => {
        const converted = convertAmount(amount);
        return converted.toFixed(selectedCurrency === 'JPY' ? 0 : 2);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="flex flex-col">
                    <CardTitle className="text-xl font-semibold flex items-center gap-2">
                        {t('plan')}
                        {transactions.length > 0 && (
                            <span className="text-sm font-normal text-muted-foreground">
                                ({transactions.length} {t('transferCount')})
                            </span>
                        )}
                    </CardTitle>
                </div>
                <div className="w-[120px]">
                    <Label className="sr-only">{t('currency')}</Label>
                    <Select
                        value={selectedCurrency}
                        onValueChange={setSelectedCurrency}
                        disabled={loadingRates}
                    >
                        <SelectTrigger className="h-8">
                            <SelectValue placeholder={t('currency')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="TWD">TWD</SelectItem>
                            <SelectItem value="JPY">JPY</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="HKD">HKD</SelectItem>
                            <SelectItem value="THB">THB</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
                {transactions.length === 0 ? (
                    <div className="text-center py-8">
                        <h4 className="text-xl font-semibold mb-2">
                            🎉 {t('great')}
                        </h4>
                        <p className="text-muted-foreground">
                            {t('noTransfers')}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-col gap-3">
                            {transactions.map((transaction, index) => (
                                <div
                                    key={index}
                                    className="rounded-xl border-2 border-orange-100 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20 dark:border-orange-900/50 p-4"
                                >
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
                                        {/* Payer */}
                                        <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
                                            <Avatar className="h-10 w-10 border-2 border-red-200 bg-red-100">
                                                <AvatarFallback className="text-red-700 font-bold bg-transparent">
                                                    {transaction.from.charAt(0).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-xs text-muted-foreground">{t('payer')}</p>
                                                <p className="font-semibold text-foreground">
                                                    {transaction.from}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Amount & Arrow */}
                                        <div className="text-center my-2 sm:my-0 flex-1">
                                            <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                                                {selectedCurrency} {formatAmount(transaction.amount)}
                                            </p>
                                            {selectedCurrency !== 'TWD' && (
                                                <p className="text-xs text-muted-foreground">
                                                    (TWD ${transaction.amount.toFixed(0)})
                                                </p>
                                            )}
                                            <div className="flex justify-center mt-1 text-muted-foreground/50">
                                                <ArrowDown className="sm:hidden h-5 w-5" />
                                                <ArrowRight className="hidden sm:block h-5 w-5" />
                                            </div>
                                        </div>

                                        {/* Payee */}
                                        <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-end">
                                            <div className="text-right">
                                                <p className="text-xs text-muted-foreground">{t('payee')}</p>
                                                <p className="font-semibold text-foreground">
                                                    {transaction.to}
                                                </p>
                                            </div>
                                            <Avatar className="h-10 w-10 border-2 border-green-200 bg-green-100">
                                                <AvatarFallback className="text-green-700 font-bold bg-transparent">
                                                    {transaction.to.charAt(0).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Alert className="mt-4 bg-blue-50/50 text-blue-900 border-blue-200 dark:bg-blue-900/10 dark:text-blue-200 dark:border-blue-900">
                            <Lightbulb className="h-4 w-4 stroke-blue-600 dark:stroke-blue-400" />
                            <AlertTitle className="text-blue-700 dark:text-blue-300 ml-2">{t('tip')}</AlertTitle>
                            <AlertDescription className="ml-2 mt-1 opacity-90">
                                {t('tipContent')}
                            </AlertDescription>
                        </Alert>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
