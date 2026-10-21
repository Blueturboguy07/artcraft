import { Button, ButtonProps } from "./button";
import { twMerge } from "tailwind-merge";

interface GenerateButtonProps extends ButtonProps {
  /** @deprecated Ignored. publik's build shows no credit cost. */
  credits?: number | null;
}

export const GenerateButton = ({
  credits: _credits,
  children,
  className,
  disabled,
  ...props
}: GenerateButtonProps) => {
  return (
    <Button
      className={twMerge(
        "group flex items-center justify-center gap-2 h-[34px]",
        className,
      )}
      disabled={disabled}
      {...props}
    >
      <span className="truncate">{children}</span>
    </Button>
  );
};

export default GenerateButton;
