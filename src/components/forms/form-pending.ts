"use client";
import { createContext } from "react";

/** null = not inside an ActionForm (fall back to useFormStatus). */
export const FormPendingContext = createContext<boolean | null>(null);
