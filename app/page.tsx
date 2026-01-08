export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          旅行分帳 App
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          輕鬆管理旅行支出,自動計算分帳
        </p>
        <div className="space-x-4">
          <a
            href="/login"
            className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
          >
            登入
          </a>
          <a
            href="/trips"
            className="inline-block px-6 py-3 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition"
          >
            查看旅行
          </a>
        </div>
      </div>
    </main>
  );
}
