import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center px-4">
        <div className="text-8xl mb-4">🐍</div>
        <h1 className="text-6xl font-bold mb-4 text-white">404</h1>
        <p className="text-2xl text-gray-400 mb-8">Page not found</p>
        <p className="text-gray-500 mb-8">
          Nothing lives at this address.
        </p>
        <Link
          href="/"
          className="inline-block px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  )
}
