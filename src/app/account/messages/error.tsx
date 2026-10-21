"use client";

export default function AccountMessagesError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-5 sm:py-10">
      <section className="rounded-[22px] border border-red-200 bg-red-50 p-5 sm:rounded-[30px] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">
          Messages
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-red-900 sm:text-3xl">
          Could not load messages
        </h1>
        <p className="mt-3 text-sm text-red-800">
          {error.message || "Unexpected error while loading your internal chat."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-red-700 px-5 text-sm font-semibold text-white transition hover:bg-red-800"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
