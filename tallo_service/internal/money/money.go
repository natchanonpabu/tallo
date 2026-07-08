// Package money handles all satang (int64) division and rounding.
// No other package should divide or round a money value.
package money

// SplitEven divides custom among n total participants (the owner may be one
// of them). Each non-owner gets floor(custom/n); the owner absorbs the
// remainder (plus their own nominal share, if included) so the numbers
// reconcile exactly. Only nonOwnerShares are ever written as ledger entries.
// See business.md #8.
func SplitEven(custom int64, n int, ownerIncluded bool) (nonOwnerShares []int64, ownerShare int64) {
	if n <= 0 {
		return nil, custom
	}
	nonOwnerCount := n
	if ownerIncluded {
		nonOwnerCount = n - 1
	}
	share := custom / int64(n)
	nonOwnerShares = make([]int64, nonOwnerCount)
	var sum int64
	for i := range nonOwnerShares {
		nonOwnerShares[i] = share
		sum += share
	}
	ownerShare = custom - sum
	return nonOwnerShares, ownerShare
}
