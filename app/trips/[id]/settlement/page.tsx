'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

interface Balance {
  userId: number;
  username: string;
  totalPaid: number;
  totalOwed: number;
  balance: number;
}

interface Transaction {
  from: string;
  to: string;
  amount: number;
}

export default function SettlementPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;

  const [balances, setBalances] = useState<Balance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSettlement();
  }, [tripId]);

  const loadSettlement = async () => {
    try {
      const response = await fetch(`/api/trips/${tripId}/settlement`);

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('無法載入結算資料');
      }

      const data = await response.json();
      setBalances(data.balances);
      setTransactions(data.transactions);
      setTotalExpenses(data.totalExpenses);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">載入中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push(`/trips/${tripId}`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            返回旅行詳情
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/trips/${tripId}`)}
              className="text-gray-600 hover:text-gray-800"
            >
              ← 返回
            </button>
            <h1 className="text-2xl font-bold text-gray-800">結算總覽</h1>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 總支出 */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg shadow-lg p-6 mb-6 text-white">
          <h2 className="text-lg font-semibold mb-2">總支出</h2>
          <p className="text-4xl font-bold">${totalExpenses.toLocaleString()}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 每人統計 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">每人統計</h2>
            <div className="space-y-3">
              {balances.map((balance) => (
                <div
                  key={balance.userId}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-800">{balance.username}</h3>
                    <span
                      className={`text-lg font-bold ${
                        balance.balance > 0
                          ? 'text-green-600'
                          : balance.balance < 0
                          ? 'text-red-600'
                          : 'text-gray-600'
                      }`}
                    >
                      {balance.balance >= 0 ? '+' : ''}${balance.balance.toFixed(0)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>總付款:</span>
                      <span className="font-medium">${balance.totalPaid.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>總應付:</span>
                      <span className="font-medium">${balance.totalOwed.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-200">
                      <span className="font-medium">狀態:</span>
                      <span className={`font-medium ${
                        balance.balance > 0
                          ? 'text-green-600'
                          : balance.balance < 0
                          ? 'text-red-600'
                          : 'text-gray-600'
                      }`}>
                        {balance.balance > 0
                          ? '應收'
                          : balance.balance < 0
                          ? '應付'
                          : '已結清'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 結算方案 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              結算方案
              {transactions.length > 0 && (
                <span className="text-sm font-normal text-gray-600 ml-2">
                  (共 {transactions.length} 筆轉帳)
                </span>
              )}
            </h2>

            {transactions.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <p className="text-lg mb-2">🎉 太好了!</p>
                <p>所有帳目已結清,無需進行轉帳</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((transaction, index) => (
                  <div
                    key={index}
                    className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-white rounded-full w-10 h-10 flex items-center justify-center font-semibold text-gray-700">
                          {transaction.from.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">付款人</p>
                          <p className="font-semibold text-gray-800">{transaction.from}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-center mx-4">
                        <p className="text-2xl font-bold text-orange-600">
                          ${transaction.amount.toFixed(0)}
                        </p>
                        <p className="text-xs text-gray-500">→</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-sm text-gray-600 text-right">收款人</p>
                          <p className="font-semibold text-gray-800 text-right">{transaction.to}</p>
                        </div>
                        <div className="bg-white rounded-full w-10 h-10 flex items-center justify-center font-semibold text-gray-700">
                          {transaction.to.charAt(0)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    💡 <strong>提示:</strong> 這是經過優化的最少轉帳次數方案,按照此方案進行轉帳即可完成結算。
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
