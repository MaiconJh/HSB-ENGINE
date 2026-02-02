type SchemaValidator = (payload: unknown) => { ok: boolean; error?: string };

export const BUILTIN_VALIDATORS: Record<string, SchemaValidator> = {
  "example:schema": (payload) => ({
    ok: typeof (payload as { ok?: boolean }).ok === "boolean",
    error: "ok must be boolean",
  }),
};
