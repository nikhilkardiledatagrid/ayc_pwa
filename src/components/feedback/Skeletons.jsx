/**
 * PWA skeleton loading components — task 7.21
 *
 * One file exports all skeletons so journeys import from a single location.
 * Every skeleton mirrors the real content layout to minimise visual shift on load.
 *
 * Usage:
 *   import { MenuLandingSkeleton, CategoryItemsSkeleton, WifiSkeleton } from '../../components/feedback/Skeletons'
 *
 * Rules (CLAUDE.md):
 *   - No blank screens — always show a skeleton while data is fetching
 *   - Touch targets min 48×48px (not relevant here, skeletons are non-interactive)
 */

// ── Base building block ───────────────────────────────────────────────────────

const Bone = ({ className = '' }) => (
  <div className={`animate-pulse rounded-2xl bg-border ${className}`} />
)

// ── Item card skeleton (2-col grid) ──────────────────────────────────────────

export const ItemCardSkeleton = () => (
  <div className="flex flex-col rounded-[1.4rem] bg-card border border-border overflow-hidden shadow-card">
    <Bone className="h-40 w-full rounded-none rounded-t-[1.4rem]" />
    <div className="p-3 flex flex-col gap-2">
      <Bone className="h-4 w-3/4" />
      <Bone className="h-3 w-full" />
      <Bone className="h-3 w-1/2" />
    </div>
    <div className="px-3 pb-3 flex items-center justify-between">
      <Bone className="h-5 w-16" />
      <Bone className="h-11 w-20 rounded-full" />
    </div>
  </div>
)

// ── Category masonry card skeleton ────────────────────────────────────────────

const CategoryCardSkeleton = ({ height = 'h-[180px]' }) => (
  <Bone className={`w-full ${height} rounded-[1.4rem]`} />
)

// ── Offer card skeleton (horizontal scroll) ───────────────────────────────────

const OfferCardSkeleton = () => (
  <div className="snap-start shrink-0 w-[64%] h-[104px] rounded-[1.3rem] bg-card border border-border overflow-hidden flex items-center gap-3 p-3">
    <div className="flex-1 flex flex-col gap-2">
      <Bone className="h-4 w-14 rounded-full" />
      <Bone className="h-3 w-20" />
      <Bone className="h-5 w-24" />
      <Bone className="h-3 w-16" />
    </div>
    <Bone className="h-[88px] w-[88px] rounded-full shrink-0" />
  </div>
)

// ── Trending rail card skeleton (horizontal scroll) ───────────────────────────

const TrendingCardSkeleton = () => (
  <div className="shrink-0 w-40 rounded-[1.6rem] bg-card border border-border overflow-hidden h-52 flex flex-col">
    <Bone className="h-28 w-full rounded-none" />
    <div className="p-3 flex flex-col gap-2 flex-1">
      <Bone className="h-4 w-3/4" />
      <Bone className="h-3 w-1/2" />
    </div>
  </div>
)

// ── Section header skeleton ───────────────────────────────────────────────────

const SectionHeaderSkeleton = () => (
  <div className="px-5 flex items-end justify-between">
    <Bone className="h-6 w-40" />
    <Bone className="h-4 w-12 rounded-full" />
  </div>
)

// ── Menu landing skeleton ─────────────────────────────────────────────────────
// Mirrors: OffersCarousel + CategoriesMasonry + TrendingRail

export const MenuLandingSkeleton = () => (
  <div className="pb-8">
    {/* Header */}
    <div className="px-5 pt-5 pb-2 flex items-start gap-3">
      <div className="flex-1 flex flex-col gap-2 pt-1">
        <Bone className="h-3 w-32" />
        <Bone className="h-8 w-48" />
        <Bone className="h-8 w-36" />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Bone className="h-12 w-16 rounded-2xl" />
        <Bone className="h-12 w-12 rounded-full" />
      </div>
    </div>

    {/* Offers carousel */}
    <div className="mt-6">
      <SectionHeaderSkeleton />
      <div className="mt-3 flex gap-3 overflow-hidden px-5 pb-2">
        <OfferCardSkeleton />
        <OfferCardSkeleton />
      </div>
    </div>

    {/* Categories masonry */}
    <div className="mt-7">
      <SectionHeaderSkeleton />
      <div className="mt-3 px-5 flex gap-3 items-start">
        <div className="flex-1 flex flex-col gap-3">
          <CategoryCardSkeleton height="h-[150px]" />
          <CategoryCardSkeleton height="h-[240px]" />
          <CategoryCardSkeleton height="h-[180px]" />
        </div>
        <div className="flex-1 flex flex-col gap-3">
          <CategoryCardSkeleton height="h-[210px]" />
          <CategoryCardSkeleton height="h-[160px]" />
          <CategoryCardSkeleton height="h-[220px]" />
        </div>
      </div>
    </div>

    {/* Trending rail */}
    <div className="mt-7">
      <SectionHeaderSkeleton />
      <div className="mt-3 flex gap-3 overflow-hidden px-5 pb-2">
        <TrendingCardSkeleton />
        <TrendingCardSkeleton />
        <TrendingCardSkeleton />
      </div>
    </div>
  </div>
)

// ── Category items skeleton (2-col grid) ──────────────────────────────────────
// Mirrors: MenuScreen category items view

export const CategoryItemsSkeleton = ({ count = 6 }) => (
  <div className="px-5 mt-3 pb-4">
    <Bone className="h-3 w-24 mb-4" />
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ItemCardSkeleton key={i} />
      ))}
    </div>
  </div>
)

// ── WiFi screen skeleton ──────────────────────────────────────────────────────
// Mirrors: WifiScreen form state

export const WifiSkeleton = () => (
  <div className="flex flex-col gap-5 px-5 pt-6">
    <Bone className="h-6 w-48" />
    <Bone className="h-4 w-64" />
    <div className="flex flex-col gap-3 mt-2">
      <Bone className="h-14 w-full rounded-2xl" />
      <Bone className="h-14 w-full rounded-2xl" />
    </div>
    <Bone className="h-14 w-full rounded-full mt-2" />
  </div>
)

// ── Review screen skeleton ────────────────────────────────────────────────────
// Mirrors: ReviewScreen rating state (star row + heading)

export const ReviewSkeleton = () => (
  <div className="flex flex-col items-center gap-5 px-5 pt-12">
    <Bone className="h-7 w-56 mx-auto" />
    <Bone className="h-5 w-40 mx-auto" />
    <div className="flex gap-4 mt-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <Bone key={i} className="h-14 w-14 rounded-full" />
      ))}
    </div>
  </div>
)

// ── Lead / form skeleton ──────────────────────────────────────────────────────
// Mirrors: LeadScreen or any dynamic form

export const FormSkeleton = ({ fields = 3 }) => (
  <div className="flex flex-col gap-4 px-5 pt-6">
    <Bone className="h-7 w-48" />
    <Bone className="h-4 w-64" />
    <div className="flex flex-col gap-3 mt-2">
      {Array.from({ length: fields }).map((_, i) => (
        <Bone key={i} className="h-14 w-full rounded-2xl" />
      ))}
    </div>
    <Bone className="h-14 w-full rounded-full mt-2" />
  </div>
)

// ── Generic list skeleton ─────────────────────────────────────────────────────

export const ListSkeleton = ({ rows = 4 }) => (
  <div className="flex flex-col gap-3 px-5 pt-4">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border">
        <Bone className="h-12 w-12 rounded-xl shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
          <Bone className="h-4 w-3/4" />
          <Bone className="h-3 w-1/2" />
        </div>
      </div>
    ))}
  </div>
)

// ── Page header skeleton ──────────────────────────────────────────────────────

export const PageHeaderSkeleton = () => (
  <div className="px-5 pt-3 pb-2 flex items-center gap-3">
    <Bone className="h-12 w-12 rounded-full shrink-0" />
    <div className="flex-1 flex flex-col gap-2">
      <Bone className="h-3 w-24" />
      <Bone className="h-5 w-40" />
    </div>
    <Bone className="h-12 w-12 rounded-full shrink-0" />
  </div>
)
