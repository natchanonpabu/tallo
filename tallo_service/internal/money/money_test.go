package money

import (
	"reflect"
	"testing"
)

func TestSplitEven(t *testing.T) {
	cases := []struct {
		name           string
		custom         int64
		n              int
		ownerIncluded  bool
		wantShares     []int64
		wantOwnerShare int64
	}{
		{
			name:           "even split, owner not participating",
			custom:         30000,
			n:              3,
			ownerIncluded:  false,
			wantShares:     []int64{10000, 10000, 10000},
			wantOwnerShare: 0,
		},
		{
			name:           "owner participates, no remainder",
			custom:         30000,
			n:              3,
			ownerIncluded:  true,
			wantShares:     []int64{10000, 10000},
			wantOwnerShare: 10000,
		},
		{
			name:           "worked example from business.md: owner absorbs remainder",
			custom:         100000,
			n:              3,
			ownerIncluded:  false,
			wantShares:     []int64{33333, 33333, 33333},
			wantOwnerShare: 1, // 100000 - 3*33333
		},
		{
			name:           "owner participates with remainder",
			custom:         100000,
			n:              3,
			ownerIncluded:  true,
			wantShares:     []int64{33333, 33333},
			wantOwnerShare: 33334, // 100000 - 2*33333
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotShares, gotOwnerShare := SplitEven(tc.custom, tc.n, tc.ownerIncluded)
			if !reflect.DeepEqual(gotShares, tc.wantShares) {
				t.Errorf("shares = %v, want %v", gotShares, tc.wantShares)
			}
			if gotOwnerShare != tc.wantOwnerShare {
				t.Errorf("ownerShare = %d, want %d", gotOwnerShare, tc.wantOwnerShare)
			}

			var sum int64
			for _, s := range gotShares {
				sum += s
			}
			if sum+gotOwnerShare != tc.custom {
				t.Errorf("shares+ownerShare = %d, want %d (custom)", sum+gotOwnerShare, tc.custom)
			}
		})
	}
}
