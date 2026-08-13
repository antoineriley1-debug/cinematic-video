"use client";

// Submit button for destructive form actions: asks for confirmation first.
// `formAction` lets one form carry a second, destructive submit target
// (e.g. Delete inside an Edit form).
export function ConfirmButton({
  children,
  message,
  className,
  formAction,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
