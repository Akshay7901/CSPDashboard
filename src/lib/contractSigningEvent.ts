import { z } from "zod";
import { CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";

export const contractEventSchema = z.enum([
  "signing_complete",
  "cancel",
  "decline",
  "session_timeout",
  "ttl_expired",
  "exception",
  "fax_pending",
  "viewing_complete",
  "access_code_failed",
  "id_check_failed",
]);

export type ContractSigningVariant = "success" | "warning" | "error" | "info";

export const contractVariantStyles: Record<ContractSigningVariant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-slate-200 bg-slate-50 text-slate-900",
};

export const contractIconStyles: Record<ContractSigningVariant, string> = {
  success: "text-emerald-600",
  warning: "text-amber-600",
  error: "text-red-600",
  info: "text-slate-600",
};

export function describeContractSigningEvent(
  event: string | undefined,
  stageLabel?: string,
): {
  title: string;
  message: string;
  variant: ContractSigningVariant;
  Icon: typeof CheckCircle2;
} {
  switch (event) {
    case "signing_complete":
    case "viewing_complete":
      return {
        variant: "success",
        Icon: CheckCircle2,
        title: stageLabel
          ? `Thank you — your ${stageLabel} has been signed`
          : "Thank you — your contract has been signed",
        message:
          "DocuSign has recorded your signature. You can safely close this tab; your proposal dashboard will update automatically once the signed copy is processed.",
      };
    case "cancel":
      return {
        variant: "warning",
        Icon: AlertTriangle,
        title: "Signing cancelled",
        message:
          "You cancelled the DocuSign session before signing. No changes were made — you can return to your proposal and start the signing flow again whenever you're ready.",
      };
    case "decline":
      return {
        variant: "error",
        Icon: XCircle,
        title: "Contract declined",
        message:
          "You declined to sign the contract in DocuSign. Our editorial team will be notified. If this was a mistake, please contact us from your proposal dashboard.",
      };
    case "session_timeout":
    case "ttl_expired":
      return {
        variant: "warning",
        Icon: Clock,
        title: "Signing session timed out",
        message:
          "Your DocuSign session expired before signing completed. Head back to your proposal to request a fresh signing link.",
      };
    case "access_code_failed":
    case "id_check_failed":
      return {
        variant: "error",
        Icon: XCircle,
        title: "Identity verification failed",
        message:
          "DocuSign couldn't verify your identity for this envelope. Please return to your proposal and try again, or contact us for assistance.",
      };
    case "exception":
      return {
        variant: "error",
        Icon: XCircle,
        title: "Something went wrong during signing",
        message:
          "DocuSign reported an unexpected error. Your proposal is unchanged — please return to the dashboard and request a fresh signing link.",
      };
    default:
      return {
        variant: "info",
        Icon: AlertTriangle,
        title: "Signing status unknown",
        message:
          "We didn't receive a recognised status from DocuSign. Open your proposal dashboard to see the current state of your contract.",
      };
  }
}
