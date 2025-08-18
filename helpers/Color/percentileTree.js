(function () {
    "use strict";

    // Order-statistic AVL tree for numeric percentiles
    // - Integer counts only allowing duplicates
    // - Used for deltaE percentiles in contrastSen.js
    // - Supports k-th selection and linear-interpolated quantiles
    //
    // - Bulk-builds a balanced tree with PercentileTree.fromArray() used in contrastSen.js

    class _Node {
        constructor(value, count = 1) {
            this.value = value;
            const c = Math.trunc(count);
            this.count = c > 0 ? c : 0;
            this.left = null;
            this.right = null;
            this.height = 1;
            this.size = this.count;
        }
    }

    class PercentileTree {
        constructor() {
            this.root = null;
        }

        // Insert a value with integer count (duplicates)
        add(value, count = 1) {
            if (!Number.isFinite(value)) return;
            if (!Number.isFinite(count)) return;

            const c = Math.trunc(count);
            if (c <= 0) return;

            this.root = this._insertNode(this.root, value, c);
        }

        insert(value, count = 1) {
            this.add(value, count);
        }
        addAll(items) {
            if (!items) return;
            for (const it of items) {
                if (Array.isArray(it)) {
                    const [v, c = 1] = it;
                    this.add(v, c);
                } else {
                    this.add(it, 1);
                }
            }
        }
        static fromArray(items) {
            if (!Array.isArray(items) || items.length === 0) {
                return new PercentileTree();
            }

            const arr = [];
            for (let i = 0; i < items.length; i++) {
                const v = items[i];
                if (Number.isFinite(v)) arr.push(v);
            }
            if (arr.length === 0) return new PercentileTree();

            arr.sort((a, b) => a - b);

            // Compact duplicates
            const uniq = [];
            let last = arr[0];
            let count = 1;

            for (let i = 1; i < arr.length; i++) {
                const v = arr[i];
                if (v === last) {
                    count++;
                } else {
                    uniq.push([last, count]);
                    last = v;
                    count = 1;
                }
            }
            uniq.push([last, count]);

            // Builds balanced from compacted data
            const tree = new PercentileTree();

            function build(lo, hi) {
                if (lo > hi) return null;
                const mid = Math.floor((lo + hi) / 2);
                const [val, cnt] = uniq[mid];
                const currNode = new _Node(val, cnt);
                currNode.left = build(lo, mid - 1);
                currNode.right = build(mid + 1, hi);
                tree._updateSubtreeMetrics(currNode);
                return currNode;
            }

            tree.root = build(0, uniq.length - 1);
            return tree;
        }

        // Total discrete items
        size() {
            return this._sizeOf(this.root);
        }

        discreteSize() {
            return this.size();
        }

        get length() {
            return this.size();
        }

        // 0-based k-th smallest If OOB returns null
        at(k) {
            if (!Number.isInteger(k) || k < 0 || k >= this.size()) return null;

            let currNode = this.root;
            let idx = k;

            while (currNode) {
                const leftSize = this._sizeOf(currNode.left);
                if (idx < leftSize) {
                    currNode = currNode.left;
                } else if (idx < leftSize + currNode.count) {
                    return currNode.value;
                } else {
                    idx -= leftSize + currNode.count;
                    currNode = currNode.right;
                }
            }
            return null;
        }

        kthSmallest(k) {
            return this.at(k);
        }

        // Linear-interpolated percentile (0..100, 0..1, '95%', 'p95')
        quantile(p) {
            const n = this.size();
            if (n === 0) return null;

            const pct = this._coercePercent(p);
            if (pct == null) return null;

            if (pct <= 0) return this.min();
            if (pct >= 100) return this.max();

            const idx = (pct / 100) * (n - 1);
            const lower = Math.floor(idx);
            const upper = Math.ceil(idx);
            if (lower === upper) return this.at(lower);

            const lowerVal = this.at(lower);
            const upperVal = this.at(upper);
            return lowerVal + (upperVal - lowerVal) * (idx - lower);
        }
        // Alias for quantile(50)
        median() {
            return this.quantile(50);
        }
        p90() {
            return this.quantile(90);
        }
        p95() {
            return this.quantile(95);
        }
        percentile(p) {
            return this.quantile(p);
        }

        min() {
            if (!this.root) return null;
            let currNode = this.root;
            while (currNode.left) currNode = currNode.left;
            return currNode.value;
        }

        max() {
            if (!this.root) return null;
            let currNode = this.root;
            while (currNode.right) currNode = currNode.right;
            return currNode.value;
        }

        clear() {
            this.root = null;
        }

        // Ascending order, respects duplicates
        toArray(limit = Infinity) {
            if (!(limit > 0)) return [];
            const out = [];
            const stack = [];
            let currNode = this.root;

            while ((currNode || stack.length) && out.length < limit) {
                while (currNode) {
                    stack.push(currNode);
                    currNode = currNode.left;
                }
                const cur = stack.pop();
                const take = Math.min(cur.count, Math.max(0, limit - out.length));
                for (let i = 0; i < take; i++) out.push(cur.value);
                currNode = cur.right;
            }

            return out;
        }

        // Small snapshot of stats
        getStats() {
            return {
                size: this.size(),
                uniqueValues: this._countUniqueValues(this.root),
                treeHeight: this._heightOf(this.root),
                isEmpty: this.size() === 0,
            };
        }

        // Internal AVL helpers
        _heightOf(currNode) {
            return currNode ? currNode.height : 0;
        }

        _sizeOf(currNode) {
            return currNode ? currNode.size : 0;
        }

        _updateSubtreeMetrics(currNode) {
            currNode.height =
                1 + Math.max(this._heightOf(currNode.left), this._heightOf(currNode.right));
            currNode.size =
                currNode.count + this._sizeOf(currNode.left) + this._sizeOf(currNode.right);
        }

        _countUniqueValues(currNode) {
            if (!currNode) return 0;
            return (
                1 +
                this._countUniqueValues(currNode.left) +
                this._countUniqueValues(currNode.right)
            );
        }

        _rRotate(pivot) {
            const lChild = pivot.left;
            const temp = lChild.right;

            lChild.right = pivot;
            pivot.left = temp;

            this._updateSubtreeMetrics(pivot);
            this._updateSubtreeMetrics(lChild);
            return lChild;
        }

        _lRotate(pivot) {
            const rChild = pivot.right;
            const temp = rChild.left;

            rChild.left = pivot;
            pivot.right = temp;

            this._updateSubtreeMetrics(pivot);
            this._updateSubtreeMetrics(rChild);
            return rChild;
        }

        _rebalance(currNode) {
            if (!currNode) return currNode;

            this._updateSubtreeMetrics(currNode);
            const balance = this._heightOf(currNode.left) - this._heightOf(currNode.right);

            // Left-heavy
            if (balance > 1) {
                const L = currNode.left;
                if (this._heightOf(L.right) > this._heightOf(L.left)) {
                    currNode.left = this._lRotate(L);
                }
                return this._rRotate(currNode);
            }

            // Right-heavy
            if (balance < -1) {
                const R = currNode.right;
                if (this._heightOf(R.left) > this._heightOf(R.right)) {
                    currNode.right = this._rRotate(R);
                }
                return this._lRotate(currNode);
            }

            // Already balanced
            return currNode;
        }

        _insertNode(currNode, value, count) {
            if (!currNode) return new _Node(value, count);

            if (value === currNode.value) {
                currNode.count += count;
            } else if (value < currNode.value) {
                currNode.left = this._insertNode(currNode.left, value, count);
            } else {
                currNode.right = this._insertNode(currNode.right, value, count);
            }

            return this._rebalance(currNode);
        }

        _coercePercent(p) {
            if (p == null) return null;

            if (typeof p === 'number' && Number.isFinite(p)) {
                if (p >= 0 && p <= 1) return p * 100; // fraction to percent
                if (p >= 0 && p <= 100) return p; // percent
                return Math.max(0, Math.min(100, p)); // clamp
            }

            if (typeof p === 'string') {
                const s = p.trim().toLowerCase();
                const raw = s.endsWith('%') ? s.slice(0, -1) : s;
                const m = raw.match(/^p?\s*([0-9]*\.?[0-9]+)\s*$/);
                if (!m) return null;
                const val = parseFloat(m[1]);
                if (!Number.isFinite(val)) return null;
                return Math.max(0, Math.min(100, val));
            }

            return null;
        }
    }

    if (typeof window !== 'undefined') {
        window.AnalyzerHelpers = window.AnalyzerHelpers || {};
        window.AnalyzerHelpers.PercentileTree = PercentileTree;
    }
})();