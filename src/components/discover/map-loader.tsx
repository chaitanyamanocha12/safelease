"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/misc";

export const RentalMapLazy = dynamic(() => import("./rental-map"), { ssr: false, loading: () => <Skeleton className="h-[420px] w-full" /> });
